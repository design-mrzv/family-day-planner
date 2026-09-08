import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, dailyPlans } from "@/lib/db/schema";
import { sendMessage, formatScheduleMessage, dateStringInTz } from "@/lib/telegram";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

// Vercel Cron (~07:00 Europe/Kyiv, див. vercel.json). Один глобальний час запуску, але
// "сьогодні" рахуємо ОКРЕМО для кожного користувача за його users.timezone — тому, хто
// живе не за Києвом, розклад прийде о іншій реальній годині, зате за ПРАВИЛЬНОЮ датою.
// Нема плану на сьогодні → мовчки пропускаємо (retention-етика, без нагадувань-докорів).
// deliveredAt захищає від повторної відправки, якщо Vercel ретраїть виклик.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const linked = await db
    .select({ id: users.id, chatId: users.telegramChatId, timezone: users.timezone })
    .from(users)
    .where(isNotNull(users.telegramChatId));

  let sent = 0;
  for (const user of linked) {
    if (!user.chatId) continue;
    const today = dateStringInTz(user.timezone, 0);
    const [plan] = await db
      .select({ id: dailyPlans.id, tasks: dailyPlans.tasks, deliveredAt: dailyPlans.deliveredAt })
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, user.id), eq(dailyPlans.date, today)))
      .limit(1);
    if (!plan || plan.deliveredAt) continue;

    try {
      await sendMessage(user.chatId, formatScheduleMessage(plan.tasks as SolverResult));
      await db.update(dailyPlans).set({ deliveredAt: new Date() }).where(eq(dailyPlans.id, plan.id));
      sent++;
    } catch (e) {
      console.error("morning-delivery sendMessage failed for", user.chatId, e);
    }
  }

  return Response.json({ ok: true, sent, total: linked.length });
}
