// Антиспам для запиту коду вхо́ду. Три незалежні обмеження:
//   - кулдаун: захищає від випадкового подвійного тапу "Надіслати ще раз";
//   - квота на email: щоб чужу скриньку не можна було завалити нашими листами;
//   - квота на IP: щоб не спалили наш ліміт у поштовому сервісі.
//
// Чиста функція над фактами з БД — усе вікно рахується тут, SQL лише віддає
// позначки часу. Сховище — наявний Postgres: на поточному масштабі Redis зайвий.

export type Limit = { max: number; windowMin: number };

export const PER_EMAIL: Limit = { max: 3, windowMin: 15 };
export const PER_IP: Limit = { max: 10, windowMin: 60 };
export const RESEND_COOLDOWN_SEC = 60;

export type ThrottleFacts = {
  emailRequestsAt: Date[];
  ipRequestsAt: Date[];
};

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "email_limit" | "ip_limit"; retryAfterSec: number };

function within(timestamps: Date[], limit: Limit, now: Date): Date[] {
  const from = now.getTime() - limit.windowMin * 60_000;
  return timestamps.filter((t) => t.getTime() > from);
}

// Скільки чекати, поки найстаріший запит випаде з вікна і звільнить місце.
function retryAfterFor(inWindow: Date[], limit: Limit, now: Date): number {
  const oldest = Math.min(...inWindow.map((t) => t.getTime()));
  const freesAt = oldest + limit.windowMin * 60_000;
  return Math.max(1, Math.ceil((freesAt - now.getTime()) / 1000));
}

// Порядок перевірок свідомий: квоти йдуть ПЕРЕД кулдауном. Інакше людині, яка
// вичерпала вікно, ми пообіцяли б "спробуйте за 60 с" — вона спробувала б і
// знову отримала відмову.
export function checkRequestThrottle(facts: ThrottleFacts, now: Date): ThrottleDecision {
  const emailInWindow = within(facts.emailRequestsAt, PER_EMAIL, now);
  if (emailInWindow.length >= PER_EMAIL.max) {
    return {
      allowed: false,
      reason: "email_limit",
      retryAfterSec: retryAfterFor(emailInWindow, PER_EMAIL, now),
    };
  }

  const ipInWindow = within(facts.ipRequestsAt, PER_IP, now);
  if (ipInWindow.length >= PER_IP.max) {
    return {
      allowed: false,
      reason: "ip_limit",
      retryAfterSec: retryAfterFor(ipInWindow, PER_IP, now),
    };
  }

  const lastRequest = Math.max(0, ...facts.emailRequestsAt.map((t) => t.getTime()));
  const sinceLastSec = (now.getTime() - lastRequest) / 1000;
  if (sinceLastSec < RESEND_COOLDOWN_SEC) {
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSec: Math.ceil(RESEND_COOLDOWN_SEC - sinceLastSec),
    };
  }

  return { allowed: true };
}
