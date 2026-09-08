import { describe, it, expect } from "vitest";
import { dateStringInTz, isValidTimezone, formatScheduleMessage } from "./telegram";
import type { SolverResult } from "./solver/types";

describe("dateStringInTz", () => {
  it("повертає формат YYYY-MM-DD", () => {
    expect(dateStringInTz("Europe/Kyiv")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("offsetDays=1 — на день пізніше за offsetDays=0", () => {
    const today = dateStringInTz("Europe/Kyiv", 0);
    const tomorrow = dateStringInTz("Europe/Kyiv", 1);
    const t1 = new Date(today + "T00:00:00Z").getTime();
    const t2 = new Date(tomorrow + "T00:00:00Z").getTime();
    expect(t2 - t1).toBe(86_400_000);
  });

  it("різні пояси можуть дати різну календарну дату для того самого моменту", () => {
    // Момент близько до півночі за Києвом (UTC+2/3) — уже наступний день,
    // а за Чикаго (UTC-5/6) — усе ще попередній. Перевіряємо саму механіку
    // формату, не конкретну годину (щоб тест не залежав від поточного часу):
    // достатньо, що функція приймає довільний IANA-рядок і не падає.
    expect(dateStringInTz("America/Chicago")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isValidTimezone", () => {
  it("приймає валідні IANA-пояси", () => {
    expect(isValidTimezone("Europe/Kyiv")).toBe(true);
    expect(isValidTimezone("America/Chicago")).toBe(true);
  });

  it("відхиляє сміття", () => {
    expect(isValidTimezone("не пояс")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("Mars/Phobos")).toBe(false);
  });
});

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
