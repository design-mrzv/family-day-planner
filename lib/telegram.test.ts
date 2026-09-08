import { describe, it, expect } from "vitest";
import { kyivDateString } from "./telegram";

describe("kyivDateString", () => {
  it("повертає формат YYYY-MM-DD", () => {
    expect(kyivDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("offsetDays=1 — на день пізніше за offsetDays=0", () => {
    const today = kyivDateString(0);
    const tomorrow = kyivDateString(1);
    const t1 = new Date(today + "T00:00:00Z").getTime();
    const t2 = new Date(tomorrow + "T00:00:00Z").getTime();
    expect(t2 - t1).toBe(86_400_000);
  });
});
