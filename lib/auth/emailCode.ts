import { createHash, randomInt, timingSafeEqual } from "crypto";

// Одноразовий 6-значний код для входу через email (замість magic link).
// Чому код, а не посилання: на iOS пуші приходять лише в PWA, встановлену на
// домашній екран, а посилання з пошти відкривається в Safari — користувач
// лишався б у PWA незалогіненим. Код читають у пошті й вводять у самій PWA.
//
// Цей модуль — чиста логіка (генерація, хешування, рішення "приймати чи ні").
// Робота з БД — у викликачів, щоб правила безпеки лишались юніт-тестованими.

export const CODE_LENGTH = 6;
export const CODE_TTL_MIN = 10; // 5 хв замало при затримці пошти, 15+ розширює вікно атаки
export const MAX_ATTEMPTS = 5; // саме це робить 6 цифр безпечними: 5 спроб із 1 000 000

// randomInt із crypto, не Math.random — останній передбачуваний і для секретів непридатний.
// padStart обовʼязковий: без нього число 42 дало б код "42" замість "000042".
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

// Зберігаємо лише хеш (той самий підхід, що hashShareToken) — витік БД не віддає живі коди.
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Звірка за сталий час — щоб час відповіді не підказував, наскільки код «майже вгаданий».
export function codesMatch(plain: string, hash: string): boolean {
  const actual = Buffer.from(hashCode(plain), "hex");
  const expected = Buffer.from(hash, "hex");
  // timingSafeEqual кидає RangeError на різних довжинах (напр. пошкоджений хеш у БД).
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export type CodeRow = {
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

// Усі правила прийняття коду в одному місці. Порядок перевірок свідомий:
// вичерпаний ліміт спроб відсікає РАНІШЕ за звірку цифр, інакше підбір тривав би вічно.
// Використаний код віддає "not_found", а не окрему причину — назовні не повідомляємо,
// що код колись існував.
export function checkCode(row: CodeRow | undefined, plain: string, now: Date): CheckResult {
  if (!row || row.consumedAt) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (!codesMatch(plain, row.codeHash)) return { ok: false, reason: "mismatch" };
  return { ok: true };
}
