import { ParsedTasksSchema, type ParsedTasks } from "./schema";

// JSON-mode зазвичай дає чистий JSON; про всяк випадок зрізаємо markdown-огорожу.
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
  }
  return JSON.parse(s); // SyntaxError при битому JSON
}

// Сирий текст відповіді моделі → валідований ParsedTasks.
// Кидає SyntaxError (битий JSON) або ZodError (не відповідає схемі).
export function validateOutput(raw: string): ParsedTasks {
  return ParsedTasksSchema.parse(extractJson(raw));
}
