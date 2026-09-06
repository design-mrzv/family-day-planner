// Заглушка Етапу 1.1: перевіряє вхід і повертає форму контракту (docs/CONTRACT.md).
// LLM-парсер (1.3) і solver (1.4) підключаються пізніше. Поки — echo, без розкладки.

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

  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json(
      { error: "bad_request", message: "Поле text обовʼязкове й непорожнє." },
      { status: 400 },
    );
  }

  // Форма успішної відповіді за контрактом. Наразі порожньо + echo вводу.
  return Response.json({
    schedule: [],
    overflow: [],
    deadlines: [],
    _stub: true,
    _echo: body,
  });
}
