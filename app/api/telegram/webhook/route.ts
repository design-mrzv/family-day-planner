import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, telegramLinkCodes } from "@/lib/db/schema";
import { sendMessage, kyivDateString } from "@/lib/telegram";
import { planAndSaveDay } from "@/lib/planDay";
import { ParseError, ServiceError } from "@/lib/parser/parseTasks";
import { isEmptyResult } from "@/lib/solver/types";

export const runtime = "nodejs";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
}

async function handleStart(chatId: string, code: string, origin: string): Promise<void> {
  const [link] = await db
    .select()
    .from(telegramLinkCodes)
    .where(
      and(
        eq(telegramLinkCodes.code, code),
        isNull(telegramLinkCodes.usedAt),
        gt(telegramLinkCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!link) {
    await sendMessage(chatId, "Код недійсний або застарілий. Згенеруй нове посилання на сайті.");
    return;
  }

  await db.update(telegramLinkCodes).set({ usedAt: new Date() }).where(eq(telegramLinkCodes.id, link.id));

  try {
    await db.update(users).set({ telegramChatId: chatId }).where(eq(users.id, link.userId));
  } catch {
    // UNIQUE(telegram_chat_id): цей chat вже привʼязаний до іншого акаунта.
    await sendMessage(chatId, "Цей Telegram вже привʼязаний до іншого акаунта.");
    return;
  }

  await sendMessage(
    chatId,
    "✅ Готово! Тепер щовечора питатиму, що на завтра, а вранці надсилатиму розклад.\n\n" +
      `Керувати планами можна й на сайті: ${origin}`,
  );
}

async function handleTaskText(chatId: string, text: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
  if (!user) {
    await sendMessage(chatId, "Спершу привʼяжи Telegram через сайт — кнопка «Підключити Telegram».");
    return;
  }

  const tomorrow = kyivDateString(1);
  try {
    const result = await planAndSaveDay(user.id, text, tomorrow);
    if (isEmptyResult(result)) {
      await sendMessage(
        chatId,
        "Здається, тут немає конкретних справ. Спробуй написати, що плануєш зробити завтра.",
      );
      return;
    }
    const n = result.schedule.length + result.overflow.length + result.deadlines.length;
    await sendMessage(chatId, `Записала ${n} справ на завтра. Розклад надішлю вранці о 07:00.`);
  } catch (e) {
    if (e instanceof ServiceError) {
      await sendMessage(chatId, "Сервіс тимчасово недоступний. Спробуй за хвилину.");
    } else if (e instanceof ParseError) {
      await sendMessage(chatId, "Не вдалося розібрати текст. Спробуй ще раз.");
    } else {
      await sendMessage(chatId, "Сталася помилка. Спробуй ще раз.");
    }
  }
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response(null, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return Response.json({ ok: true }); // Telegram не має ретраїти на невалідний body
  }

  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text) return Response.json({ ok: true });

  const chatId = String(message.chat.id);

  try {
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      const origin = new URL(request.url).origin;
      if (!code) {
        await sendMessage(chatId, `Привʼяжи акаунт через сайт: ${origin} → кнопка «Підключити Telegram».`);
      } else {
        await handleStart(chatId, code, origin);
      }
    } else {
      await handleTaskText(chatId, text);
    }
  } catch (e) {
    // Ніколи не даємо Telegram ретраїти нескінченно через нашу помилку.
    console.error("telegram webhook error:", e);
  }

  return Response.json({ ok: true });
}
