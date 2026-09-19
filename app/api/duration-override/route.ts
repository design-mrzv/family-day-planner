import { z } from "zod";
import { getSession } from "@/lib/auth/getSession";
import { saveDurationOverride } from "@/lib/duration";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  title: z.string().trim().min(1),
  duration_min: z.number().int().positive().max(480),
});

// Мама править тривалість справи в UI → зберігаємо, наступного разу solver
// підставить це замість дефолту (lib/solver/solve.ts: DurationOverrides).
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Очікується JSON-тіло." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "bad_request", message: "Потрібні title (текст) і duration_min (додатне число, ≤480)." },
      { status: 400 },
    );
  }

  await saveDurationOverride(session.userId, parsed.data.title, parsed.data.duration_min);

  return Response.json({ ok: true });
}
