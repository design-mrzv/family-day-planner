import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { taskColors } from "@/lib/db/schema";
import { normalizeTaskKey } from "@/lib/solver/config";

export const runtime = "nodejs";

// Усі кольори, які людина сама закріпила за задачами — одним запитом для клієнта
// (ScheduleView/TaskDetailSheet будують мапу taskKey → colorIndex).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const rows = await db
    .select({ taskKey: taskColors.taskKey, colorIndex: taskColors.colorIndex })
    .from(taskColors)
    .where(eq(taskColors.userId, session.userId));

  const colors = Object.fromEntries(rows.map((r) => [r.taskKey, r.colorIndex]));
  return Response.json({ colors });
}

const BodySchema = z.strictObject({
  title: z.string().trim().min(1),
  color_index: z.number().int().min(1).max(6),
});

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
      { error: "bad_request", message: "Потрібні title (текст) і color_index (1-6)." },
      { status: 400 },
    );
  }

  const taskKey = normalizeTaskKey(parsed.data.title);
  await db
    .insert(taskColors)
    .values({ userId: session.userId, taskKey, colorIndex: parsed.data.color_index })
    .onConflictDoUpdate({
      target: [taskColors.userId, taskColors.taskKey],
      set: { colorIndex: parsed.data.color_index, updatedAt: new Date() },
    });
  return Response.json({ ok: true });
}
