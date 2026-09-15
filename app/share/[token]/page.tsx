import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { users, dailyPlans } from "@/lib/db/schema";
import { hashShareToken } from "@/lib/share";
import { dateStringInTz } from "@/lib/timezone";
import ScheduleView from "../../ScheduleView";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

// Публічна read-only сторінка для партнера (PRODUCT_SPEC_v2 розділ 4 крок 6, жорстка
// межа: тільки перегляд). Без сесії — ідентичність резолвиться токеном у URL, не cookie.
// "Сьогодні" рахується за поясом ВЛАСНИЦІ акаунта (dateStringInTz), не гостя — у партнера
// немає ні сесії, ні власного users.timezone.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [user] = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(eq(users.shareTokenHash, hashShareToken(token)))
    .limit(1);
  if (!user) notFound();

  const today = dateStringInTz(user.timezone, 0);
  const [plan] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, user.id), eq(dailyPlans.date, today)))
    .limit(1);

  const result = plan?.tasks as SolverResult | undefined;

  return (
    <main>
      <h1>Family Day Planner</h1>
      {result ? <ScheduleView result={result} readOnly /> : <p>Плану на сьогодні ще немає.</p>}
    </main>
  );
}
