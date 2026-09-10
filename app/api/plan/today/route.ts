import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { users, dailyPlans } from "@/lib/db/schema";
import { dateStringInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

// Ранковий перегляд без пере-парсингу LLM: якщо на сьогодні (за поясом користувача)
// вже є розклад — Planner.tsx показує його одразу при відкритті, без кліку "Розкласти".
// Заодно віддає "tomorrow" — щоб поле вводу за замовчуванням цілило в правильну дату
// для вечірнього вводу (замість дати браузера).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.userId)).limit(1);
  const timezone = user?.timezone ?? DEFAULT_TIMEZONE;
  const today = dateStringInTz(timezone, 0);
  const tomorrow = dateStringInTz(timezone, 1);

  const [plan] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, today)))
    .limit(1);

  return Response.json({
    result: (plan?.tasks as SolverResult | undefined) ?? null,
    date: today,
    tomorrow,
  });
}
