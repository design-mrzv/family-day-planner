import { z } from "zod";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { durationOverrides } from "@/lib/db/schema";
import { normalizeTaskKey } from "@/lib/solver/config";

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

  const taskKey = normalizeTaskKey(parsed.data.title);
  await db
    .insert(durationOverrides)
    .values({ userId: session.userId, taskKey, durationMin: parsed.data.duration_min })
    .onConflictDoUpdate({
      target: [durationOverrides.userId, durationOverrides.taskKey],
      set: { durationMin: parsed.data.duration_min, updatedAt: new Date() },
    });

  return Response.json({ ok: true });
}
