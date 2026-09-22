import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { users, dailyPlans } from "@/lib/db/schema";
import { dateStringInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

// Перегляд завтрашнього плану через дропдаун дати в заголовку (Етап 5, раунд 11) —
// точна копія /api/plan/today, лише для tomorrow. Дозволяє повернутись до "Сьогодні"
// після перегляду "Завтра" (і навпаки) без повторного розкладання.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.userId)).limit(1);
  const timezone = user?.timezone ?? DEFAULT_TIMEZONE;
  const tomorrow = dateStringInTz(timezone, 1);

  const [plan] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, tomorrow)))
    .limit(1);

  return Response.json({
    result: (plan?.tasks as SolverResult | undefined) ?? null,
    date: tomorrow,
  });
}
