import type { SolverResult } from "./solver/types";

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

// Ранкова видача: план текстом для Telegram (plain text, без markdown).
export function formatScheduleMessage(result: SolverResult): string {
  const lines = ["Доброго ранку! Ось твій план на сьогодні:", ""];

  const visible = result.schedule.filter((s) => s.status !== "moved");
  if (visible.length === 0) {
    lines.push("Порожньо.");
  } else {
    for (const s of visible) {
      lines.push(`${s.start} — ${s.title} (${s.duration_min} хв)${s.type === "fixed" ? " [фіксовано]" : ""}`);
    }
  }

  if (result.overflow.length > 0) {
    lines.push("", "Не влізло сьогодні:");
    for (const o of result.overflow) {
      lines.push(`- ${o.title} (${o.duration_min} хв) — ${o.reason === "conflict" ? "конфлікт часу" : "немає місця"}`);
    }
  }

  if (result.deadlines.length > 0) {
    lines.push("", "Дедлайни:");
    for (const d of result.deadlines) lines.push(`- ${d.title} — до ${d.date}`);
  }

  return lines.join("\n");
}
