import { GoogleGenAI } from "@google/genai";
import { type ParsedTasks } from "./schema";
import { SYSTEM_INSTRUCTION, buildContents } from "./prompt";
import { validateOutput } from "./validate";

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

// Головний вхід: текст → tasks[]. Один ретрай при сміттєвому виводі, потім чесна помилка.
export async function parseTasks(text: string, today: string): Promise<ParsedTasks> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ParseError("GEMINI_API_KEY не налаштований");
  const ai = new GoogleGenAI({ apiKey });

  try {
    return validateOutput(await callModel(ai, text, today));
  } catch {
    // Одна повторна спроба.
    try {
      return validateOutput(await callModel(ai, text, today));
    } catch (second) {
      throw new ParseError("Модель повернула невалідний JSON після ретраю", second);
    }
  }
}
