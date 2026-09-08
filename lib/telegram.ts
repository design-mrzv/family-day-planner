// Мінімальна обгортка над Telegram Bot API. Без SDK — двом функціям бібліотека не потрібна.

export const BOT_USERNAME = "familydayplannerbot";

function apiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не налаштований");
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

// Реєструє webhook в Telegram. Викликається один раз вручну (скрипт), не з застосунку.
export async function setWebhook(url: string, secretToken: string): Promise<unknown> {
  const res = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: secretToken }),
  });
  return res.json();
}

// Поточна дата в Europe/Kyiv (не сервера — Vercel serverless працює в UTC).
// offsetDays: 0 = сьогодні, 1 = завтра.
export function kyivDateString(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Kyiv" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
