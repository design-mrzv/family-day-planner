import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans } from "@/lib/db/schema";
import { computeRoutine, type PlanRow } from "@/lib/routine";

export const runtime = "nodejs";

// Заготовка рутинних справ для textarea на день 2+: назви, що повторювались
// у ≥2 з останніх 7 збережених днів. Детерміновано, без LLM.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const rows = await db
    .select({ date: dailyPlans.date, tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(eq(dailyPlans.userId, session.userId))
    .orderBy(desc(dailyPlans.date))
    .limit(7);

  const prefill = computeRoutine(rows as PlanRow[]);
  return Response.json({ prefill });
}
