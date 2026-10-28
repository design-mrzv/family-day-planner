import { describe, it, expect } from "vitest";
import {
  checkRequestThrottle,
  PER_EMAIL,
  PER_IP,
  RESEND_COOLDOWN_SEC,
  type ThrottleFacts,
} from "./throttle";

const now = new Date("2026-10-28T12:00:00Z");
const secAgo = (s: number) => new Date(now.getTime() - s * 1000);
const minAgo = (m: number) => secAgo(m * 60);

const nothing: ThrottleFacts = { emailRequestsAt: [], ipRequestsAt: [] };

describe("checkRequestThrottle", () => {
  it("дозволяє, коли запитів ще не було", () => {
    expect(checkRequestThrottle(nothing, now)).toEqual({ allowed: true });
  });

  it("кулдаун одразу після попереднього запиту, із залишком у секундах", () => {
    const facts = { ...nothing, emailRequestsAt: [secAgo(10)] };
    expect(checkRequestThrottle(facts, now)).toEqual({
      allowed: false,
      reason: "cooldown",
      retryAfterSec: RESEND_COOLDOWN_SEC - 10,
    });
  });

  it("дозволяє рівно на межі кулдауну", () => {
    const facts = { ...nothing, emailRequestsAt: [secAgo(RESEND_COOLDOWN_SEC)] };
    expect(checkRequestThrottle(facts, now)).toEqual({ allowed: true });
  });

  it("ліміт на email, коли вичерпано квоту вікна", () => {
    // Рівно PER_EMAIL.max запитів, найстаріший — 5 хвилин тому.
    const facts = { ...nothing, emailRequestsAt: [minAgo(5), minAgo(3), minAgo(2)] };
    expect(facts.emailRequestsAt).toHaveLength(PER_EMAIL.max);
    expect(checkRequestThrottle(facts, now)).toEqual({
      allowed: false,
      reason: "email_limit",
      // Звільниться, коли найстаріший запит випаде з вікна: 15 хв - 5 хв = 10 хв.
      retryAfterSec: (PER_EMAIL.windowMin - 5) * 60,
    });
  });

  it("запити, старші за вікно, не враховуються", () => {
    const facts = {
      ...nothing,
      emailRequestsAt: [minAgo(30), minAgo(25), minAgo(20)],
    };
    expect(checkRequestThrottle(facts, now)).toEqual({ allowed: true });
  });

  it("ліміт на IP, навіть коли email ще має квоту", () => {
    const facts: ThrottleFacts = {
      emailRequestsAt: [],
      ipRequestsAt: Array.from({ length: PER_IP.max }, (_, i) => minAgo(i + 2)),
    };
    const result = checkRequestThrottle(facts, now);
    expect(result).toMatchObject({ allowed: false, reason: "ip_limit" });
  });

  it("ліміт вікна має пріоритет над кулдауном — не обіцяємо 60 с, коли чекати 10 хв", () => {
    const facts = { ...nothing, emailRequestsAt: [minAgo(5), minAgo(3), secAgo(10)] };
    expect(checkRequestThrottle(facts, now)).toMatchObject({
      allowed: false,
      reason: "email_limit",
    });
  });

  it("менше за квоту й поза кулдауном — дозволяє", () => {
    const facts = { ...nothing, emailRequestsAt: [minAgo(5), minAgo(3)] };
    expect(checkRequestThrottle(facts, now)).toEqual({ allowed: true });
  });
});
