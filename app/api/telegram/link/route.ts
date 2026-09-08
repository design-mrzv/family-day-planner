import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { telegramLinkCodes } from "@/lib/db/schema";
import { BOT_USERNAME } from "@/lib/telegram";

export const runtime = "nodejs";

const CODE_TTL_MIN = 15;

// Генерує одноразовий код прив'язки Telegram: t.me/bot?start=код → бот у webhook
// знаходить цей рядок і пише users.telegram_chat_id (docs/CONTRACT.md розділ 6-7).
export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const code = randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
  await db.insert(telegramLinkCodes).values({ userId: session.userId, code, expiresAt });

  return Response.json({ deepLink: `https://t.me/${BOT_USERNAME}?start=${code}` });
}
