import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";

// Vercel Cron (~19:00 Europe/Kyiv, див. vercel.json). Питає всіх привʼязаних користувачів
// про завтра — початок двотактного циклу (PRODUCT_SPEC_v2 розділ 4).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const rows = await db.select({ chatId: users.telegramChatId }).from(users).where(isNotNull(users.telegramChatId));

  let sent = 0;
  for (const row of rows) {
    if (!row.chatId) continue;
    try {
      await sendMessage(row.chatId, "Що плануєш на завтра? Напиши мені одним текстом.");
      sent++;
    } catch (e) {
      console.error("evening-ping sendMessage failed for", row.chatId, e);
    }
  }

  return Response.json({ ok: true, sent, total: rows.length });
}
