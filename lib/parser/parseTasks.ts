import { GoogleGenAI } from "@google/genai";
import { ParsedTasksSchema, type ParsedTasks } from "./schema";
import { SYSTEM_INSTRUCTION, buildContents } from "./prompt";

const MODEL = "gemini-2.5-flash";

// Чесна помилка парсера (LLM повернув сміття, або нема ключа).
export class ParseError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

// JSON-mode зазвичай дає чистий JSON; про всяк випадок зрізаємо markdown-огорожу.
function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
  }
  return JSON.parse(s);
}

async function callModel(ai: GoogleGenAI, text: string, today: string): Promise<string> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: buildContents(text, today),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const out = res.text;
  if (!out) throw new ParseError("Порожня відповідь моделі");
  return out;
}

// Парс тексту + валідація схемою. Кидає при невалідному JSON.
function validate(raw: string): ParsedTasks {
  const json = extractJson(raw); // SyntaxError при битому JSON
  return ParsedTasksSchema.parse(json); // ZodError при невідповідності схемі
}

// Головний вхід: текст → tasks[]. Один ретрай при сміттєвому виводі, потім чесна помилка.
export async function parseTasks(text: string, today: string): Promise<ParsedTasks> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ParseError("GEMINI_API_KEY не налаштований");
  const ai = new GoogleGenAI({ apiKey });

  try {
    return validate(await callModel(ai, text, today));
  } catch {
    // Одна повторна спроба.
    try {
      return validate(await callModel(ai, text, today));
    } catch (second) {
      throw new ParseError("Модель повернула невалідний JSON після ретраю", second);
    }
  }
}
