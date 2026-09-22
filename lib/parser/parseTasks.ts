import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { type ParsedTasks } from "./schema";
import { SYSTEM_INSTRUCTION, buildContents } from "./prompt";
import { validateOutput } from "./validate";

const MODEL = "gemini-3.5-flash-lite"; // дешевша за flash, окрема квота, парсингу вистачає
// Резервна модель на випадок перевантаження основної (503/429) — Етап 5, раунд 10,
// реальний живий інцидент. Те саме покоління, повноцінний "flash" (не lite), окрема
// квота від основної. НЕ друга модель для перевірки виводу (те правило лишається —
// fallback лише робить ТУ САМУ роботу парсингу, коли основна недоступна, не звіряє
// результат основної).
const FALLBACK_MODEL = "gemini-3.5-flash";
// Під час цього ж інциденту (Google-side, розділ 26 CONTRACT.md) виклики моделі можуть
// не падати одразу, а висіти по 40+ секунд перед відповіддю — без ліміту це саме той час
// з'їдає весь бюджет serverless-функції на Vercel (сира помилка платформи замість
// зрозумілого ServiceError). Обрізаємо кожен окремий виклик, щоб перевантажена модель
// не могла втримати запит довше, ніж є сенс чекати.
const CALL_TIMEOUT_MS = 10_000;

// Модель повернула сміття (невалідний JSON після ретраю) — проблема у виводі, не в сервісі.
export class ParseError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

// Сервіс недоступний: нема ключа, ліміт (429), перевантаження (503), мережа.
// Окремо від ParseError, щоб не звинувачувати текст користувача в тому, що винен API.
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Порожня відповідь трактується як сміттєвий вивід (кандидат на ретрай), не як збій сервісу.
class EmptyOutputError extends Error {}

async function callModel(ai: GoogleGenAI, model: string, text: string, today: string): Promise<string> {
  const res = await ai.models.generateContent({
    model,
    contents: buildContents(text, today),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0,
      // Парсинг простий — мінімум «думання».
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  });
  const out = res.text;
  if (!out) throw new EmptyOutputError();
  return out;
}

// 503 (перевантаження), 429 (ліміт) чи власний таймаут (CALL_TIMEOUT_MS, модель не
// встигла відповісти) — варто спробувати резервну модель, в неї окрема квота. Інші
// збої (мережа, невірний ключ) fallback не полагодить.
function isOverloaded(e: unknown): boolean {
  if (e instanceof ApiError && (e.status === 503 || e.status === 429)) return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

// Основна модель недоступна → одна спроба резервною, без стану між викликами: щойно
// основна знову запрацює, НАСТУПНИЙ виклик піде саме через неї (кожен виклик завжди
// починає з основної). Будь-який збій (обох моделей) → ServiceError.
async function callWithFallback(ai: GoogleGenAI, text: string, today: string): Promise<string> {
  try {
    return await callModel(ai, MODEL, text, today);
  } catch (e) {
    if (e instanceof EmptyOutputError) throw e; // сміттєвий вивід → ретрай вище, не fallback
    if (!isOverloaded(e)) throw new ServiceError("Сервіс тимчасово недоступний (ліміт або перевантаження).", e);
    try {
      return await callModel(ai, FALLBACK_MODEL, text, today);
    } catch (e2) {
      if (e2 instanceof EmptyOutputError) throw e2;
      throw new ServiceError("Сервіс тимчасово недоступний (ліміт або перевантаження).", e2);
    }
  }
}

// Головний вхід: текст → tasks[].
// Ретрай — тільки на невалідний вивід моделі. Збої API одразу → ServiceError.
export async function parseTasks(text: string, today: string): Promise<ParsedTasks> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ServiceError("GEMINI_API_KEY не налаштований");
  const ai = new GoogleGenAI({ apiKey });

  try {
    return validateOutput(await callWithFallback(ai, text, today));
  } catch (first) {
    if (first instanceof ServiceError) throw first; // ліміт/перевантаження — ретрай не поможе
    // Невалідний JSON або порожній вивід — одна повторна спроба.
    try {
      return validateOutput(await callWithFallback(ai, text, today));
    } catch (second) {
      if (second instanceof ServiceError) throw second;
      throw new ParseError("Модель повернула невалідний JSON після ретраю", second);
    }
  }
}
