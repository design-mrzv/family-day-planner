import { describe, it, expect } from "vitest";
import { computeRoutine, type PlanRow } from "./routine";

const day = (date: string, ...titles: string[]): PlanRow => ({
  date,
  tasks: { schedule: titles.map((title) => ({ title })), overflow: [] },
});

describe("computeRoutine", () => {
  it("порожня історія → порожній рядок", () => {
    expect(computeRoutine([])).toBe("");
  });

  it("справа у ≥2 днях → рутина; одноразова → ні", () => {
    const plans = [
      day("2026-09-05", "вечеря", "тренування"),
      day("2026-09-06", "вечеря", "магазин"),
    ];
    const r = computeRoutine(plans);
    expect(r).toContain("вечеря"); // 2 дні
    expect(r).not.toContain("тренування"); // 1 день
    expect(r).not.toContain("магазин"); // 1 день
  });

  it("повтор у межах одного дня не рахується двічі", () => {
    const plans = [day("2026-09-05", "вечеря", "вечеря"), day("2026-09-06", "магазин")];
    expect(computeRoutine(plans)).toBe(""); // вечеря лише в 1 дні
  });

  it("нормалізація: 'Вечеря' і 'вечеря ' — та сама справа", () => {
    const plans = [day("2026-09-05", "Вечеря"), day("2026-09-06", "вечеря ")];
    expect(computeRoutine(plans)).toContain("вечеря");
  });

  it("найчастіші першими; показуємо найсвіжіший варіант назви", () => {
    const plans = [
      day("2026-09-04", "садок", "вечеря"),
      day("2026-09-05", "садок", "вечеря"),
      day("2026-09-06", "садок"),
    ];
    // садок у 3 днях, вечеря у 2 → садок першим
    expect(computeRoutine(plans)).toBe("садок, вечеря");
  });

  it("overflow теж рахується, deadlines — ні", () => {
    const plans: PlanRow[] = [
      { date: "2026-09-05", tasks: { schedule: [], overflow: [{ title: "прибирання" }] } },
      { date: "2026-09-06", tasks: { schedule: [{ title: "прибирання" }], overflow: [] } },
    ];
    expect(computeRoutine(plans)).toBe("прибирання");
  });

  it("поріг регулюється", () => {
    const plans = [day("2026-09-05", "йога"), day("2026-09-06", "йога"), day("2026-09-07", "йога")];
    expect(computeRoutine(plans, 3)).toBe("йога");
    expect(computeRoutine(plans, 4)).toBe("");
  });
});
