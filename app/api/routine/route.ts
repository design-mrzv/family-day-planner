import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans, ignoredRoutines } from "@/lib/db/schema";
import { computePrefill, type PlanRow } from "@/lib/routine";

export const runtime = "nodejs";

// Заготовка для textarea на день 2+: незакрите з останнього дня (крок 4 спеку)
// + рутинні справи (≥2 з останніх 7 днів), дедуп за назвою, мінус те, що людина
// явно прибрала з пропозицій (Етап 5, раунд 8 — ignoredRoutines). Детерміновано,
// без LLM.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const [rows, ignoredRows] = await Promise.all([
    db
      .select({ date: dailyPlans.date, tasks: dailyPlans.tasks })
      .from(dailyPlans)
      .where(eq(dailyPlans.userId, session.userId))
      .orderBy(desc(dailyPlans.date))
      .limit(7),
    db.select({ taskKey: ignoredRoutines.taskKey }).from(ignoredRoutines).where(eq(ignoredRoutines.userId, session.userId)),
  ]);

  const ignored = new Set(ignoredRows.map((r) => r.taskKey));
  const items = computePrefill(rows as PlanRow[], undefined, ignored);
  return Response.json({ items });
}
