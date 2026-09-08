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

export const DEFAULT_TIMEZONE = "Europe/Kyiv"; // цільова аудиторія спеку; users.timezone default

// Поточна дата в заданому IANA-поясі (не сервера — Vercel serverless працює в UTC).
// offsetDays: 0 = сьогодні, 1 = завтра.
export function dateStringInTz(timezone: string, offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Валідний IANA timezone-рядок? (Intl кидає RangeError на невідомий/сміттєвий рядок.)
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Найчастіші міста, які по-різному пишуться в IANA (Україна — суцільно Europe/Kyiv,
// стара назва "Kiev" теж трапляється) або їх немає в базі як окремого запису.
const CITY_ALIASES: Record<string, string> = {
  "київ": "Europe/Kyiv",
  kyiv: "Europe/Kyiv",
  kiev: "Europe/Kyiv",
  "львів": "Europe/Kyiv",
  lviv: "Europe/Kyiv",
  "одеса": "Europe/Kyiv",
  odesa: "Europe/Kyiv",
  odessa: "Europe/Kyiv",
  "харків": "Europe/Kyiv",
  kharkiv: "Europe/Kyiv",
  "дніпро": "Europe/Kyiv",
  dnipro: "Europe/Kyiv",
  "запоріжжя": "Europe/Kyiv",
  zaporizhzhia: "Europe/Kyiv",
  "вінниця": "Europe/Kyiv",
  vinnytsia: "Europe/Kyiv",
  // Іспанія — теж один пояс на всю країну (крім Канарських), IANA знає лише Madrid.
  "валенсія": "Europe/Madrid",
  valencia: "Europe/Madrid",
  "малага": "Europe/Madrid",
  malaga: "Europe/Madrid",
  "барселона": "Europe/Madrid",
  barcelona: "Europe/Madrid",
  "севілья": "Europe/Madrid",
  sevilla: "Europe/Madrid",
  seville: "Europe/Madrid",

  // --- Рівень країни: тільки для країн з ОДНИМ поясом на всю територію.
  // Багатозонні (США/Канада/Австралія/Росія/Бразилія тощо) свідомо не додаємо
  // сюди — там немає єдиної правильної відповіді, краще хай впишуть місто
  // (пошук по IANA-містах уже це покриває) або /timezone +N.
  "україна": "Europe/Kyiv",
  ukraine: "Europe/Kyiv",
  "німеччина": "Europe/Berlin",
  germany: "Europe/Berlin",
  deutschland: "Europe/Berlin",
  "іспанія": "Europe/Madrid",
  spain: "Europe/Madrid",
  "франція": "Europe/Paris",
  france: "Europe/Paris",
  "польща": "Europe/Warsaw",
  poland: "Europe/Warsaw",
  "італія": "Europe/Rome",
  italy: "Europe/Rome",
  "португалія": "Europe/Lisbon",
  portugal: "Europe/Lisbon",
  "нідерланди": "Europe/Amsterdam",
  netherlands: "Europe/Amsterdam",
  "бельгія": "Europe/Brussels",
  belgium: "Europe/Brussels",
  "австрія": "Europe/Vienna",
  austria: "Europe/Vienna",
  "швейцарія": "Europe/Zurich",
  switzerland: "Europe/Zurich",
  "чехія": "Europe/Prague",
  "czech republic": "Europe/Prague",
  czechia: "Europe/Prague",
  "словаччина": "Europe/Bratislava",
  slovakia: "Europe/Bratislava",
  "угорщина": "Europe/Budapest",
  hungary: "Europe/Budapest",
  "румунія": "Europe/Bucharest",
  romania: "Europe/Bucharest",
  "греція": "Europe/Athens",
  greece: "Europe/Athens",
  "швеція": "Europe/Stockholm",
  sweden: "Europe/Stockholm",
  "норвегія": "Europe/Oslo",
  norway: "Europe/Oslo",
  "данія": "Europe/Copenhagen",
  denmark: "Europe/Copenhagen",
  "фінляндія": "Europe/Helsinki",
  finland: "Europe/Helsinki",
  "ірландія": "Europe/Dublin",
  ireland: "Europe/Dublin",
  "великобританія": "Europe/London",
  "англія": "Europe/London",
  "uk": "Europe/London",
  "united kingdom": "Europe/London",
  england: "Europe/London",
  "туреччина": "Europe/Istanbul",
  turkey: "Europe/Istanbul",

  // --- Столиці (і "берлін") кирилицею: пошук по IANA — точний посимвольний збіг,
  // кирилиця з латиницею НІКОЛИ не зрівняється, навіть якщо місто саме там є
  // (напр. "Берлин" не знайде "Berlin"). Ті самі країни, що вище — лише інший запис.
  "берлін": "Europe/Berlin",
  "берлин": "Europe/Berlin",
  "варшава": "Europe/Warsaw",
  "париж": "Europe/Paris",
  "рим": "Europe/Rome",
  "мадрид": "Europe/Madrid",
  "лондон": "Europe/London",
  "відень": "Europe/Vienna",
  "вена": "Europe/Vienna",
  "прага": "Europe/Prague",
  "будапешт": "Europe/Budapest",
  "бухарест": "Europe/Bucharest",
  "афіни": "Europe/Athens",
  "афины": "Europe/Athens",
  "стокгольм": "Europe/Stockholm",
  "осло": "Europe/Oslo",
  "копенгаген": "Europe/Copenhagen",
  "гельсінкі": "Europe/Helsinki",
  "хельсинки": "Europe/Helsinki",
  "дублін": "Europe/Dublin",
  "дублин": "Europe/Dublin",
  "стамбул": "Europe/Istanbul",
  "амстердам": "Europe/Amsterdam",
  "брюссель": "Europe/Brussels",
  "брюссел": "Europe/Brussels",
  "цюрих": "Europe/Zurich",
  "цюріх": "Europe/Zurich",
  "братислава": "Europe/Bratislava",
  "лісабон": "Europe/Lisbon",
  "лиссабон": "Europe/Lisbon",
};

// "+2", "-5", "UTC+2", "GMT-5" → Etc/GMT∓N (в IANA цей запис історично з ІНВЕРТОВАНИМ
// знаком — Etc/GMT-2 це UTC+2). Фолбек, що працює для будь-якого міста на Землі, коли
// назва не впізнана — не тримати ж список усіх міст світу вручну.
function resolveUtcOffset(input: string): string | null {
  const m = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})$/i.exec(input);
  if (!m) return null;
  const hours = Number(m[2]);
  if (hours > 14) return null; // немає таких поясів
  if (hours === 0) return "Etc/UTC";
  const inverted = m[1] === "+" ? "-" : "+";
  return `Etc/GMT${inverted}${hours}`;
}

// Приймає довільний ввід — повну IANA-назву ("America/Chicago"), просто місто
// ("Чикаго"/"Chicago") або зсув від UTC ("+2") — і повертає канонічний IANA-рядок,
// або null, якщо не впізнала (нема сенсу вгадувати навмання: краще перепитати,
// ніж мовчки взяти не той пояс).
export function resolveTimezone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isValidTimezone(trimmed)) return trimmed;

  const key = trimmed.toLowerCase();
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];

  const offset = resolveUtcOffset(trimmed);
  if (offset) return offset;

  const normalized = key.replace(/\s+/g, "_");
  const matches = Intl.supportedValuesOf("timeZone").filter((zone) => {
    const city = zone.slice(zone.lastIndexOf("/") + 1).toLowerCase();
    return city === normalized;
  });
  return matches.length === 1 ? matches[0] : null;
}
