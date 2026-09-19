import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans } from "@/lib/db/schema";
import { DATE_RE } from "@/lib/parser/schema";
import { normalizeTaskKey, toMin } from "@/lib/solver/config";
import { findFreeSlot, type Interval } from "@/lib/solver/solve";
import type { SolverResult, Scheduled } from "@/lib/solver/types";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  date: z.string().regex(DATE_RE),
  title: z.string().trim().min(1),
});

function end(s: Scheduled): number {
  return toMin(s.start) + s.duration_min;
}

// "Перенести → сьогодні (вільний час)" з екрана деталей (Етап 5, раунд 4) — той самий
// findFreeSlot, що вже застосовує /api/plan/reschedule для зсуву конфліктних задач, лише
// викликаний напряму для самої обраної задачі. Дзеркалить app/api/plan/move/route.ts.
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
    return Response.json({ error: "bad_request", message: "Потрібні date і title." }, { status: 400 });
  }

  const [row] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, parsed.data.date)))
    .limit(1);
  if (!row) {
    return Response.json({ error: "not_found", message: "План на цю дату не знайдено." }, { status: 404 });
  }

  const tasks = row.tasks as SolverResult;
  const key = normalizeTaskKey(parsed.data.title);
  const target = tasks.schedule.find((s) => normalizeTaskKey(s.title) === key && s.status !== "moved");
  if (!target) {
    return Response.json({ error: "not_found", message: "Задачу не знайдено в розкладі." }, { status: 404 });
  }

  const occupied: Interval[] = tasks.schedule
    .filter((s) => s !== target && s.status !== "moved")
    .map((s) => ({ start: toMin(s.start), end: end(s), buffer: 0 }));

  const freeStart = findFreeSlot(target.duration_min, occupied);
  if (freeStart == null) {
    return Response.json(
      { error: "no_free_slot", message: "Сьогодні немає вільного часу такої тривалості." },
      { status: 409 },
    );
  }

  target.start = freeStart;
  tasks.schedule.sort((a, b) => toMin(a.start) - toMin(b.start));

  await db
    .update(dailyPlans)
    .set({ tasks, updatedAt: new Date() })
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, parsed.data.date)));

  return Response.json(tasks);
}
