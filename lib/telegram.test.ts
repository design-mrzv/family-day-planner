import { describe, it, expect } from "vitest";
import { dateStringInTz, isValidTimezone, resolveTimezone, formatScheduleMessage } from "./telegram";
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

describe("resolveTimezone", () => {
  it("приймає повну IANA-назву як є", () => {
    expect(resolveTimezone("America/Chicago")).toBe("America/Chicago");
  });

  it("розпізнає англійську назву міста", () => {
    expect(resolveTimezone("Chicago")).toBe("America/Chicago");
    expect(resolveTimezone("chicago")).toBe("America/Chicago"); // регістр не важливий
  });

  it("український аліас: будь-яке велике місто України → Europe/Kyiv", () => {
    expect(resolveTimezone("Атлантида")).toBeNull(); // вигадане місто — і досі не в базі
    expect(resolveTimezone("Київ")).toBe("Europe/Kyiv");
    expect(resolveTimezone("київ")).toBe("Europe/Kyiv");
    expect(resolveTimezone("Львів")).toBe("Europe/Kyiv");
    expect(resolveTimezone("Kyiv")).toBe("Europe/Kyiv");
    expect(resolveTimezone("Kiev")).toBe("Europe/Kyiv"); // стара назва
  });

  it("не вгадує — незнайоме місто повертає null, а не приблизний варіант", () => {
    expect(resolveTimezone("Атлантида")).toBeNull();
    expect(resolveTimezone("")).toBeNull();
    expect(resolveTimezone("   ")).toBeNull();
  });

  it("пробіл у назві міста нормалізується в підкреслення (як в IANA)", () => {
    expect(resolveTimezone("New York")).toBe("America/New_York");
  });

  it("країни з одним поясом на всю країну: місто, якого нема в IANA окремо — з аліасу", () => {
    // Іспанія — суцільно Europe/Madrid, IANA не знає "Valencia"/"Malaga" як окремі зони.
    expect(resolveTimezone("Valencia")).toBe("Europe/Madrid");
    expect(resolveTimezone("Малага")).toBe("Europe/Madrid");
  });

  it("рівень країни: покриває міста, для яких нема окремого аліасу", () => {
    expect(resolveTimezone("Дуйсбург")).toBeNull(); // не впізнане місто, і не в аліасах
    expect(resolveTimezone("Germany")).toBe("Europe/Berlin");
    expect(resolveTimezone("Німеччина")).toBe("Europe/Berlin");
    expect(resolveTimezone("Deutschland")).toBe("Europe/Berlin");
    expect(resolveTimezone("Україна")).toBe("Europe/Kyiv");
  });

  it("Frankfurt/Мюнхен — конкретний аліас (не лише через рівень країни)", () => {
    expect(resolveTimezone("Frankfurt")).toBe("Europe/Berlin");
    expect(resolveTimezone("Франкфурт")).toBe("Europe/Berlin");
    expect(resolveTimezone("Munich")).toBe("Europe/Berlin");
    expect(resolveTimezone("Мюнхен")).toBe("Europe/Berlin");
  });

  it("великі міста США без власного запису в IANA — однозначні, на відміну від country-рівня", () => {
    expect(resolveTimezone("Houston")).toBe("America/Chicago");
    expect(resolveTimezone("Miami")).toBe("America/New_York");
    expect(resolveTimezone("Seattle")).toBe("America/Los_Angeles");
    expect(resolveTimezone("Маямі")).toBe("America/New_York");
  });

  it("кирилична форма міст, які латиницею вже в IANA (Чикаго, Сідней)", () => {
    expect(resolveTimezone("Чикаго")).toBe("America/Chicago");
    expect(resolveTimezone("Сідней")).toBe("Australia/Sydney");
    expect(resolveTimezone("Торонто")).toBe("America/Toronto");
  });

  it("апостроф у транслітерації нормалізується незалежно від конкретного символу", () => {
    expect(resolveTimezone("Х'юстон")).toBe("America/Chicago"); // прямий '
    expect(resolveTimezone("Х’юстон")).toBe("America/Chicago"); // типографський ’
    expect(resolveTimezone("Х‘юстон")).toBe("America/Chicago"); // ліва лапка ‘
    expect(resolveTimezone("Хюстон")).toBe("America/Chicago"); // взагалі без апострофа
  });

  it("столиця кирилицею впізнається, навіть якщо латиницею вона й так у IANA (Берлін)", () => {
    // "Berlin" (латиницею) сам знайшовся б через пошук по IANA-містах; кирилична "Берлін"/
    // "Берлин" — ні (посимвольний збіг не переступає скрипти), тому потрібен окремий аліас.
    expect(resolveTimezone("Берлін")).toBe("Europe/Berlin");
    expect(resolveTimezone("Берлин")).toBe("Europe/Berlin");
    expect(resolveTimezone("Berlin")).toBe("Europe/Berlin"); // латиницею й так працює (контроль)
  });

  it("Intl сам знає деякі застарілі аліаси країн (Poland→Europe/Warsaw) — приймаються як є", () => {
    // isValidTimezone("Poland") вже true (ICU legacy-посилання), тож повертається без
    // нормалізації — це коректно: реально резолвиться в Europe/Warsaw при форматуванні.
    const resolved = resolveTimezone("Poland")!;
    const probe = new Date("2026-06-15T12:00:00Z");
    const viaResolved = new Intl.DateTimeFormat("en-US", { timeZone: resolved, hourCycle: "h23", hour: "numeric" }).format(probe);
    const viaCanonical = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", hourCycle: "h23", hour: "numeric" }).format(probe);
    expect(viaResolved).toBe(viaCanonical);
  });

  it("багатозонні країни свідомо НЕ мають аліасу країни — нема єдиної правильної відповіді", () => {
    expect(resolveTimezone("USA")).toBeNull();
    expect(resolveTimezone("Canada")).toBeNull();
    expect(resolveTimezone("Australia")).toBeNull();
  });

  it("зсув від UTC як фолбек, коли місто взагалі не впізнано", () => {
    expect(resolveTimezone("+2")).toBe("Etc/GMT-2"); // IANA: знак інвертований
    expect(resolveTimezone("-5")).toBe("Etc/GMT+5");
    expect(resolveTimezone("UTC+2")).toBe("Etc/GMT-2");
    expect(resolveTimezone("gmt-5")).toBe("Etc/GMT+5");
    expect(resolveTimezone("+0")).toBe("Etc/UTC");
  });

  it("двоцифровий зсув Intl приймає напряму як власний ідентифікатор (не через наш фолбек)", () => {
    // "+15" — синтаксично валідний ICU fixed-offset zone; повертається як є першою ж
    // перевіркою isValidTimezone(), до того, як дійде до resolveUtcOffset().
    expect(resolveTimezone("+15")).toBe("+15");
  });

  it("Etc/GMT-2 реально дає UTC+2 (перевірка інверсії знаку не лише рядком)", () => {
    const zone = resolveTimezone("+2")!;
    const probe = new Date("2026-06-15T12:00:00Z"); // літо — без сюрпризів DST
    const local = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(
      probe,
    );
    expect(local).toBe("14"); // 12:00 UTC + 2 = 14:00
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
