import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { type ParsedTasks } from "./schema";
import { SYSTEM_INSTRUCTION, buildContents } from "./prompt";
import { validateOutput } from "./validate";

const MODEL = "gemini-3.6-flash";

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

async function callModel(ai: GoogleGenAI, text: string, today: string): Promise<string> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: buildContents(text, today),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0,
      // Парсинг простий — мінімум «думання». Без цього 3.6-flash тупить ~22с/запит.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
  const out = res.text;
  if (!out) throw new EmptyOutputError();
  return out;
}

// Виклик моделі, що конвертує будь-який збій API/мережі у ServiceError.
async function callOrServiceError(ai: GoogleGenAI, text: string, today: string): Promise<string> {
  try {
    return await callModel(ai, text, today);
  } catch (e) {
    if (e instanceof EmptyOutputError) throw e; // сміттєвий вивід → ретрай вище
    throw new ServiceError("Сервіс тимчасово недоступний (ліміт або перевантаження).", e);
  }
}

// Головний вхід: текст → tasks[].
// Ретрай — тільки на невалідний вивід моделі. Збої API одразу → ServiceError.
export async function parseTasks(text: string, today: string): Promise<ParsedTasks> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ServiceError("GEMINI_API_KEY не налаштований");
  const ai = new GoogleGenAI({ apiKey });

  try {
    return validateOutput(await callOrServiceError(ai, text, today));
  } catch (first) {
    if (first instanceof ServiceError) throw first; // ліміт/перевантаження — ретрай не поможе
    // Невалідний JSON або порожній вивід — одна повторна спроба.
    try {
      return validateOutput(await callOrServiceError(ai, text, today));
    } catch (second) {
      if (second instanceof ServiceError) throw second;
      throw new ParseError("Модель повернула невалідний JSON після ретраю", second);
    }
  }
}
