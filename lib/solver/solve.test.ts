import { describe, it, expect } from "vitest";
import { solve } from "./solve";
import { toMin } from "./config";
import type { Task } from "../parser/schema";

const task = (title: string, fixed_time: string | null = null, deadline: string | null = null): Task => ({
  title,
  fixed_time,
  deadline,
});

// Інваріант: у розкладі жодні дві справи не накладаються.
function assertNoOverlap(schedule: { start: string; duration_min: number }[]) {
  const sorted = [...schedule].sort((a, b) => toMin(a.start) - toMin(b.start));
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = toMin(sorted[i - 1].start) + sorted[i - 1].duration_min;
    expect(toMin(sorted[i].start)).toBeGreaterThanOrEqual(prevEnd);
  }
}

describe("solve", () => {
  it("порожній ввід → порожній результат, не падає", () => {
    expect(solve([])).toEqual({ schedule: [], overflow: [], deadlines: [] });
  });

  it("дедлайн-справа → у deadlines, не в schedule", () => {
    const r = solve([task("оплатити садок", null, "2026-09-08")]);
    expect(r.deadlines).toEqual([{ title: "оплатити садок", date: "2026-09-08" }]);
    expect(r.schedule).toHaveLength(0);
    expect(r.overflow).toHaveLength(0);
  });

  it("fixed_time + deadline одночасно → fixed виграє, у розклад, не в deadlines", () => {
    const r = solve([task("забрати старшого", "15:00", "2026-09-08")]);
    expect(r.deadlines).toHaveLength(0);
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0]).toMatchObject({ start: "15:00", type: "fixed" });
  });

  it("дві фіксовані на одну годину → обидві в overflow (conflict), не мовчазне накладення", () => {
    const r = solve([task("зустріч А", "15:00"), task("зустріч Б", "15:00")]);
    expect(r.schedule).toHaveLength(0);
    expect(r.overflow).toHaveLength(2);
    expect(r.overflow.every((o) => o.reason === "conflict")).toBe(true);
  });

  it("незнайома справа → fallback-тривалість 30, розкладена, не падає", () => {
    const r = solve([task("щось геть незнайоме")]);
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0].duration_min).toBe(30);
  });

  it("справ на ~16 год, вікон на 15 → overflow непорожній, решта розкладена, нічого не втрачено", () => {
    const tasks = Array.from({ length: 40 }, (_, i) => task(`справа ${i}`));
    const r = solve(tasks);
    expect(r.schedule.length).toBeGreaterThan(0);
    expect(r.overflow.length).toBeGreaterThan(0);
    // жодна справа не зникла мовчки
    expect(r.schedule.length + r.overflow.length).toBe(40);
    expect(r.overflow.every((o) => o.reason === "no_slot")).toBe(true);
    assertNoOverlap(r.schedule);
  });

  it("правило: тренування розкладається зранку (до 12:00)", () => {
    const r = solve([task("тренування")]);
    expect(r.schedule).toHaveLength(1);
    expect(toMin(r.schedule[0].start)).toBeLessThan(toMin("12:00"));
    expect(toMin(r.schedule[0].start)).toBeGreaterThanOrEqual(toMin("07:00"));
  });

  it("правило: зйомка розкладається після 17:00", () => {
    const r = solve([task("зйомка відео")]);
    expect(r.schedule).toHaveLength(1);
    expect(toMin(r.schedule[0].start)).toBeGreaterThanOrEqual(toMin("17:00"));
  });

  it("правило: вечеря розкладається ввечері (не одразу вранці)", () => {
    const r = solve([task("сніданок"), task("повечеряти")]);
    const dinner = r.schedule.find((s) => s.title === "повечеряти");
    expect(dinner).toBeDefined();
    expect(toMin(dinner!.start)).toBeGreaterThanOrEqual(toMin("18:00"));
  });

  it("правило: обід розкладається ополудні", () => {
    const r = solve([task("приготувати обід")]);
    expect(r.schedule).toHaveLength(1);
    expect(toMin(r.schedule[0].start)).toBeGreaterThanOrEqual(toMin("12:00"));
    expect(toMin(r.schedule[0].start)).toBeLessThan(toMin("15:00"));
  });

  it("правило: забрати дитину зі школи — вдень/ввечері, не одразу після відвезення", () => {
    const r = solve([task("відвести молодшого сина в школу"), task("забрати дітей")]);
    const pickup = r.schedule.find((s) => s.title === "забрати дітей");
    expect(pickup).toBeDefined();
    expect(toMin(pickup!.start)).toBeGreaterThanOrEqual(toMin("13:00"));
  });

  it("'забрати посилку' — без обмеження часу (не плутати з дитячим пікапом)", () => {
    const r = solve([task("забрати посилку")]);
    expect(r.schedule).toHaveLength(1);
    expect(toMin(r.schedule[0].start)).toBe(toMin("07:00"));
  });

  it("між двома гнучкими справами є буфер (≥10 хв)", () => {
    const r = solve([task("справа один"), task("справа два")]);
    expect(r.schedule).toHaveLength(2);
    const sorted = [...r.schedule].sort((a, b) => toMin(a.start) - toMin(b.start));
    const gap = toMin(sorted[1].start) - (toMin(sorted[0].start) + sorted[0].duration_min);
    expect(gap).toBeGreaterThanOrEqual(10);
  });

  it("навколо лікаря (fixed) — розширений буфер збори+дорога (≥20 хв), не 10", () => {
    const r = solve([task("стоматолог", "11:00"), task("зустріч")]);
    const doctor = r.schedule.find((s) => s.title === "стоматолог")!;
    const other = r.schedule.find((s) => s.title === "зустріч")!;
    expect(doctor.start).toBe("11:00");
    const doctorEnd = toMin(doctor.start) + doctor.duration_min;
    const otherStart = toMin(other.start);
    // 'зустріч' розкладена до або після лікаря — в обох випадках відступ ≥20 хв
    if (otherStart >= doctorEnd) {
      expect(otherStart - doctorEnd).toBeGreaterThanOrEqual(20);
    } else {
      expect(toMin(doctor.start) - (otherStart + other.duration_min)).toBeGreaterThanOrEqual(20);
    }
  });

  it("навколо шкільного пікапу — розширений буфер дорога (≥15 хв)", () => {
    const r = solve([task("забрати дітей", "13:00"), task("готуватись до звіту")]);
    const pickup = r.schedule.find((s) => s.title === "забрати дітей")!;
    const other = r.schedule.find((s) => s.title === "готуватись до звіту")!;
    const pickupEnd = toMin(pickup.start) + pickup.duration_min;
    const otherStart = toMin(other.start);
    if (otherStart >= pickupEnd) {
      expect(otherStart - pickupEnd).toBeGreaterThanOrEqual(15);
    } else {
      expect(toMin(pickup.start) - (otherStart + other.duration_min)).toBeGreaterThanOrEqual(15);
    }
  });

  it("гнучкі справи не лізуть в останню годину перед сном (після 21:00)", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => task(`справа ${i}`));
    const r = solve(tasks);
    for (const s of r.schedule) {
      expect(toMin(s.start) + s.duration_min).toBeLessThanOrEqual(toMin("21:00"));
    }
  });

  it("явний маркер 'перед сном' у назві — ввечері, незалежно від активності", () => {
    const r = solve([task("почитати книгу перед сном")]);
    expect(r.schedule).toHaveLength(1);
    expect(toMin(r.schedule[0].start)).toBeGreaterThanOrEqual(toMin("18:00"));
  });

  it("реалістичний змішаний день: без накладень, фіксовані на місці", () => {
    const r = solve([
      task("тренування"),
      task("забрати старшого", "15:00"),
      task("зняти відео"),
      task("вечеря"),
      task("оплатити садок", null, "2026-09-07"),
    ]);
    assertNoOverlap(r.schedule);
    expect(r.schedule.find((s) => s.title === "забрати старшого")).toMatchObject({
      start: "15:00",
      type: "fixed",
    });
    expect(r.deadlines).toHaveLength(1);
  });

  it("детермінізм: той самий вхід → той самий вихід", () => {
    const tasks = [task("тренування"), task("вечеря"), task("забрати", "15:00")];
    expect(solve(tasks)).toEqual(solve(tasks));
  });
});
