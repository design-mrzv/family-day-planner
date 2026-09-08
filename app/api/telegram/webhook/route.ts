import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, telegramLinkCodes } from "@/lib/db/schema";
import { sendMessage, dateStringInTz, resolveTimezone } from "@/lib/telegram";
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
  } catch (e) {
    // 23505 = unique_violation (users.telegram_chat_id): цей chat вже привʼязаний
    // до іншого акаунта. Будь-яку ІНШУ помилку — не діагностуємо неправильно,
    // пробрасуємо далі (зовнішній catch webhook-у залогує й чесно промовчить).
    if ((e as { code?: string }).code === "23505") {
      await sendMessage(chatId, "Цей Telegram вже привʼязаний до іншого акаунта.");
      return;
    }
    throw e;
  }

  await sendMessage(
    chatId,
    "✅ Готово! Тепер щовечора питатиму, що на завтра, а вранці надсилатиму розклад.\n\n" +
      "Якщо живеш не за київським часом — напиши /timezone і назва міста (напр. /timezone Чикаго), " +
      "інакше 'завтра' рахуватиметься неправильно.\n\n" +
      `Керувати планами можна й на сайті: ${origin}`,
  );
}

// /timezone <місто або IANA-пояс> — явно, без вгадування (Telegram не передає TZ
// користувача). Приймає просто назву міста ("Чикаго"/"Chicago") — не треба знати формат.
async function handleTimezone(chatId: string, arg: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
  if (!user) {
    await sendMessage(chatId, "Спершу привʼяжи Telegram через сайт — кнопка «Підключити Telegram».");
    return;
  }

  if (!arg) {
    await sendMessage(
      chatId,
      `Твій поточний часовий пояс: ${user.timezone}.\n` + "Щоб змінити: /timezone і назва міста, напр. /timezone Чикаго.",
    );
    return;
  }

  const resolved = resolveTimezone(arg);
  if (!resolved) {
    await sendMessage(
      chatId,
      `Не впізнала "${arg}". Спробуй назву країни (напр. /timezone Germany), більше велике\n` +
        "місто поруч, або просто різницю з UTC, напр. /timezone +2.",
    );
    return;
  }

  await db.update(users).set({ timezone: resolved }).where(eq(users.id, user.id));
  await sendMessage(chatId, `Готово, часовий пояс тепер ${resolved}.`);
}

async function handleTaskText(chatId: string, text: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
  if (!user) {
    await sendMessage(chatId, "Спершу привʼяжи Telegram через сайт — кнопка «Підключити Telegram».");
    return;
  }

  const tomorrow = dateStringInTz(user.timezone, 1);
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
    await sendMessage(chatId, `Записала ${n} справ на завтра. Розклад надішлю вранці.`);
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
    } else if (text.startsWith("/timezone")) {
      await handleTimezone(chatId, text.slice("/timezone".length).trim());
    } else {
      await handleTaskText(chatId, text);
    }
  } catch (e) {
    // Ніколи не даємо Telegram ретраїти нескінченно через нашу помилку.
    console.error("telegram webhook error:", e);
  }

  return Response.json({ ok: true });
}
