import { describe, it, expect } from "vitest";
import { formatScheduleMessage } from "./telegram";
import type { SolverResult } from "./solver/types";

describe("formatScheduleMessage", () => {
  it("порожній результат → 'Порожньо.'", () => {
    const empty: SolverResult = { schedule: [], overflow: [], deadlines: [] };
    expect(formatScheduleMessage(empty)).toContain("Порожньо.");
  });

  it("ховає перенесені (status=moved) справи", () => {
    const r: SolverResult = {
      schedule: [
        { title: "вечеря", start: "18:00", duration_min: 40, type: "flexible" },
        { title: "прибирання", start: "19:00", duration_min: 45, type: "flexible", status: "moved" },
      ],
      overflow: [],
      deadlines: [],
    };
    const msg = formatScheduleMessage(r);
    expect(msg).toContain("вечеря");
    expect(msg).not.toContain("прибирання");
  });

  it("показує overflow і дедлайни окремими блоками", () => {
    const r: SolverResult = {
      schedule: [],
      overflow: [{ title: "зустріч", duration_min: 60, reason: "conflict" }],
      deadlines: [{ title: "оплатити газ", date: "2026-09-10" }],
    };
    const msg = formatScheduleMessage(r);
    expect(msg).toContain("Не влізло сьогодні");
    expect(msg).toContain("конфлікт часу");
    expect(msg).toContain("Дедлайни");
    expect(msg).toContain("оплатити газ — до 2026-09-10");
  });
});
