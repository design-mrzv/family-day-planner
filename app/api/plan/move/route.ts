import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans } from "@/lib/db/schema";
import { DATE_RE } from "@/lib/parser/schema";
import { normalizeTaskKey } from "@/lib/solver/config";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  date: z.string().regex(DATE_RE),
  title: z.string().trim().min(1),
});

// "→ завтра": позначає справу moved у збереженому плані дня. Вона зникає з
// сьогоднішнього вигляду, але лишається в daily_plans → завтра природно
// потрапляє в заготовку (computePrefill бере всі назви останнього дня).
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
  if (target) target.status = "moved";

  await db
    .update(dailyPlans)
    .set({ tasks, updatedAt: new Date() })
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, parsed.data.date)));

  return Response.json(tasks);
}
