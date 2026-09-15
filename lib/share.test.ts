import { describe, it, expect } from "vitest";
import { hashShareToken } from "./share";

describe("hashShareToken", () => {
  it("детермінований — той самий вхід дає той самий хеш", () => {
    expect(hashShareToken("abc123")).toBe(hashShareToken("abc123"));
  });

  it("різні токени дають різні хеші", () => {
    expect(hashShareToken("abc123")).not.toBe(hashShareToken("abc124"));
  });

  it("повертає hex-рядок SHA-256 (64 символи)", () => {
    expect(hashShareToken("будь-що")).toMatch(/^[0-9a-f]{64}$/);
  });
});
