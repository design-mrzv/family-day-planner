import { describe, it, expect } from "vitest";
import {
  generateCode,
  hashCode,
  codesMatch,
  checkCode,
  CODE_LENGTH,
  MAX_ATTEMPTS,
  type CodeRow,
} from "./emailCode";

describe("generateCode", () => {
  it("завжди повертає рівно 6 цифр (у т.ч. з провідними нулями)", () => {
    // 200 ітерацій: без паддінгу число на кшталт 42 дало б "42", а не "000042".
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
    }
  });

  it("не повертає ту саму константу щоразу", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("hashCode", () => {
  it("детермінований — той самий код дає той самий хеш", () => {
    expect(hashCode("123456")).toBe(hashCode("123456"));
  });

  it("різні коди дають різні хеші", () => {
    expect(hashCode("123456")).not.toBe(hashCode("123457"));
  });

  it("повертає hex-рядок SHA-256 (64 символи)", () => {
    expect(hashCode("000042")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("codesMatch", () => {
  it("true, коли код відповідає хешу", () => {
    expect(codesMatch("123456", hashCode("123456"))).toBe(true);
  });

  it("false, коли код не відповідає хешу", () => {
    expect(codesMatch("123456", hashCode("654321"))).toBe(false);
  });

  it("false, а не виняток, коли хеш пошкоджений чи іншої довжини", () => {
    // timingSafeEqual кидає RangeError на буферах різної довжини — не має впасти.
    expect(() => codesMatch("123456", "коротко")).not.toThrow();
    expect(codesMatch("123456", "коротко")).toBe(false);
  });
});

describe("checkCode", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const future = new Date("2026-10-28T12:05:00Z");
  const past = new Date("2026-10-28T11:55:00Z");

  const valid: CodeRow = {
    codeHash: hashCode("123456"),
    attempts: 0,
    expiresAt: future,
    consumedAt: null,
  };

  it("ok, коли код правильний і живий", () => {
    expect(checkCode(valid, "123456", now)).toEqual({ ok: true });
  });

  it("not_found, коли рядка немає", () => {
    expect(checkCode(undefined, "123456", now)).toEqual({ ok: false, reason: "not_found" });
  });

  it("expired, коли термін дії минув", () => {
    expect(checkCode({ ...valid, expiresAt: past }, "123456", now)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("mismatch на неправильний код", () => {
    expect(checkCode(valid, "999999", now)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("too_many_attempts, коли вичерпано ліміт спроб", () => {
    expect(checkCode({ ...valid, attempts: MAX_ATTEMPTS }, "123456", now)).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("ліміт спроб перевіряється РАНІШЕ за звірку коду — вгаданий код уже не рятує", () => {
    const burned = { ...valid, attempts: MAX_ATTEMPTS };
    expect(checkCode(burned, "123456", now)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("використаний код не приймається навіть із правильними цифрами", () => {
    expect(checkCode({ ...valid, consumedAt: past }, "123456", now)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("протермінований код не приймається навіть до вичерпання спроб", () => {
    expect(checkCode({ ...valid, expiresAt: past, attempts: 0 }, "123456", now)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
