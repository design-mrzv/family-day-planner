import { parseTasks, ParseError } from "@/lib/parser/parseTasks";
import { DATE_RE } from "@/lib/parser/schema";

// Ключ Gemini живе тут, на сервері. Node-рантайм (SDK потребує Node, не edge).
export const runtime = "nodejs";

function todayString(): string {
  return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD у локальному часі
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "bad_request", message: "Очікується JSON-тіло." },
      { status: 400 },
    );
  }

  const b = body as { text?: unknown; today?: unknown } | null;
  const text = b?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json(
      { error: "bad_request", message: "Поле text обовʼязкове й непорожнє." },
      { status: 400 },
    );
  }
  const today = typeof b?.today === "string" && DATE_RE.test(b.today) ? b.today : todayString();

  try {
    const parsed = await parseTasks(text, today);
    // Проміжно (до solver-а 1.4): віддаємо форму контракту з порожньою розкладкою
    // + розпарсені справи в _parsed, щоб очима звірити роботу парсера.
    return Response.json({
      schedule: [],
      overflow: [],
      deadlines: [],
      _parsed: parsed.tasks,
    });
  } catch (e) {
    if (e instanceof ParseError) {
      return Response.json(
        { error: "parse_failed", message: "Не вдалося розібрати текст. Спробуй ще раз." },
        { status: 502 },
      );
    }
    return Response.json(
      { error: "internal", message: "Внутрішня помилка." },
      { status: 500 },
    );
  }
}
