import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, dailyPlans } from "@/lib/db/schema";
import { sendMessage, formatScheduleMessage, kyivDateString } from "@/lib/telegram";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";

// Vercel Cron (~07:00 Europe/Kyiv, див. vercel.json). Шле повний розклад усім, у кого
// є telegram_chat_id І збережений план на сьогодні (немає плану → мовчки пропускаємо,
// без нагадувань-докорів — retention-етика, PRODUCT_SPEC_v2 розділ 10).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const today = kyivDateString(0);
  const rows = await db
    .select({ chatId: users.telegramChatId, tasks: dailyPlans.tasks })
    .from(users)
    .innerJoin(dailyPlans, and(eq(dailyPlans.userId, users.id), eq(dailyPlans.date, today)))
    .where(isNotNull(users.telegramChatId));

  let sent = 0;
  for (const row of rows) {
    if (!row.chatId) continue;
    try {
      await sendMessage(row.chatId, formatScheduleMessage(row.tasks as SolverResult));
      sent++;
    } catch (e) {
      console.error("morning-delivery sendMessage failed for", row.chatId, e);
    }
  }

  return Response.json({ ok: true, sent, total: rows.length });
}
