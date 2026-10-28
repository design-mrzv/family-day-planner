import { eq, and, gt, desc, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { users, emailCodes } from "../db/schema";
import { sendLoginCode } from "../email/send";
import { generateCode, hashCode, checkCode, CODE_TTL_MIN, type CheckResult } from "./emailCode";
import { checkRequestThrottle, PER_EMAIL, PER_IP, type ThrottleDecision } from "./throttle";

// Звʼязка «чиста логіка + БД + пошта». Самі правила живуть в emailCode.ts і throttle.ts
// (вони під юніт-тестами), тут лише ввід-вивід.

async function throttleFor(email: string, ip: string | null, now: Date): Promise<ThrottleDecision> {
  const emailSince = new Date(now.getTime() - PER_EMAIL.windowMin * 60_000);
  const ipSince = new Date(now.getTime() - PER_IP.windowMin * 60_000);

  const emailRows = await db
    .select({ createdAt: emailCodes.createdAt })
    .from(emailCodes)
    .where(and(eq(emailCodes.email, email), gt(emailCodes.createdAt, emailSince)));

  const ipRows = ip
    ? await db
        .select({ createdAt: emailCodes.createdAt })
        .from(emailCodes)
        .where(and(eq(emailCodes.requestIp, ip), gt(emailCodes.createdAt, ipSince)))
    : [];

  return checkRequestThrottle(
    {
      emailRequestsAt: emailRows.map((r) => r.createdAt),
      ipRequestsAt: ipRows.map((r) => r.createdAt),
    },
    now,
  );
}

export type RequestResult =
  | { ok: true; devCode?: string }
  | { ok: false; reason: "cooldown" | "email_limit" | "ip_limit"; retryAfterSec: number };

export async function requestLoginCode(email: string, ip: string | null): Promise<RequestResult> {
  const now = new Date();

  const throttle = await throttleFor(email, ip, now);
  if (!throttle.allowed) {
    return { ok: false, reason: throttle.reason, retryAfterSec: throttle.retryAfterSec };
  }

  // Гасимо попередні живі коди цього email — дійсним лишається тільки найновіший,
  // інакше два запити поспіль дали б два робочі коди.
  await db
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt)));

  const code = generateCode();
  await db.insert(emailCodes).values({
    email,
    codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MIN * 60_000),
    requestIp: ip,
  });

  try {
    await sendLoginCode(email, code, CODE_TTL_MIN);
  } catch (err) {
    // У проді збій відправки — справжня помилка: людина коду не отримає, і мовчати не можна.
    if (process.env.NODE_ENV === "production") throw err;
    // Локально дозволяємо працювати без підтвердженого домену в Resend — код віддамо нижче.
    console.warn("[auth] лист не надіслано:", err instanceof Error ? err.message : err);
  }

  // Код у відповіді — ТІЛЬКИ поза продом, щоб локальна розробка не залежала від пошти.
  // Саме ця піддавка без перевірки оточення і була дірою в попередньому magic-link-вході.
  return process.env.NODE_ENV === "production" ? { ok: true } : { ok: true, devCode: code };
}

export type VerifyResult = { ok: true; userId: string } | (CheckResult & { ok: false });

export async function verifyLoginCode(email: string, code: string): Promise<VerifyResult> {
  const now = new Date();

  const [row] = await db
    .select()
    .from(emailCodes)
    .where(and(eq(emailCodes.email, email), isNull(emailCodes.consumedAt)))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  const result = checkCode(row, code, now);

  if (!result.ok) {
    // Невдалу спробу треба записати, інакше лічильник MAX_ATTEMPTS нічого не обмежує.
    if (row && result.reason === "mismatch") {
      await db
        .update(emailCodes)
        .set({ attempts: sql`${emailCodes.attempts} + 1` })
        .where(eq(emailCodes.id, row.id));
    }
    return result;
  }

  await db.update(emailCodes).set({ consumedAt: now }).where(eq(emailCodes.id, row!.id));

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: true, userId: existing.id };

  const [created] = await db.insert(users).values({ email }).returning();
  return { ok: true, userId: created.id };
}
