import { eq } from "drizzle-orm";
import { parseTasks } from "./parser/parseTasks";
import { solve, type DurationOverrides } from "./solver/solve";
import type { SolverResult } from "./solver/types";
import { db } from "./db/client";
import { durationOverrides as durationOverridesTable, dailyPlans } from "./db/schema";

// Спільне ядро для веб (/api/plan) і Telegram (webhook): текст → tasks[] → розклад →
// збереження. Кидає ParseError/ServiceError з lib/parser/parseTasks — виклик сам вирішує,
// як показати помилку користувачу (JSON-відповідь чи повідомлення в чат).
// minStartMinutes: прокидається в solve() — FAB "Сьогодні" без існуючого плану передає
// поточний момент дня, щоб гнучкі справи не поставило в минуле (0 = без обмеження,
// звичайне вечірнє планування на завтра).
export async function planAndSaveDay(userId: string, text: string, date: string, minStartMinutes = 0): Promise<SolverResult> {
  const parsed = await parseTasks(text, date); // LLM: текст → tasks[]

  const overrideRows = await db
    .select({ taskKey: durationOverridesTable.taskKey, durationMin: durationOverridesTable.durationMin })
    .from(durationOverridesTable)
    .where(eq(durationOverridesTable.userId, userId));
  const overrides: DurationOverrides = new Map(overrideRows.map((r) => [r.taskKey, r.durationMin]));

  const result = solve(parsed.tasks, overrides, minStartMinutes); // детермінований solver: tasks[] → розклад

  await db
    .insert(dailyPlans)
    .values({ userId, date, inputText: text, tasks: result })
    .onConflictDoUpdate({
      target: [dailyPlans.userId, dailyPlans.date],
      set: { inputText: text, tasks: result, updatedAt: new Date() },
    });

  return result;
}
