import { describe, it, expect } from "vitest";
import { placeNewTasks } from "./addTasks";
import { toMin } from "./config";
import type { SolverResult, Scheduled } from "./types";
import type { Task } from "../parser/schema";

const task = (
  title: string,
  fixed_time: string | null = null,
  deadline: string | null = null,
  time_hint: Task["time_hint"] = null,
  duration_min: number | null = null,
): Task => ({ title, fixed_time, deadline, time_hint, duration_min });

const scheduled = (title: string, start: string, duration_min: number, type: Scheduled["type"] = "flexible"): Scheduled => ({
  title,
  start,
  duration_min,
  type,
});

const empty = (): SolverResult => ({ schedule: [], overflow: [], deadlines: [] });

describe("placeNewTasks", () => {
  it("гнучка задача без конфліктів → додається в schedule", () => {
    const existing = empty();
    const res = placeNewTasks([task("йога")], existing, new Map(), false);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.schedule).toHaveLength(1);
    expect(existing.schedule[0].title).toBe("йога");
  });

  it("Етап 5, раунд 13: явний duration_min з тексту перемагає і словник, і збережений override", () => {
    const existing = empty();
    const overrides = new Map([["заняття з логопедом", 45]]);
    const res = placeNewTasks([task("заняття з логопедом", null, null, null, 20)], existing, overrides, false);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.schedule[0].duration_min).toBe(20);
  });

  it("назва вже є в schedule → мовчазний no-op, не дублює", () => {
    const existing: SolverResult = { schedule: [scheduled("садок", "09:00", 30)], overflow: [], deadlines: [] };
    const res = placeNewTasks([task("Садок ")], existing, new Map(), false); // інший регістр/пробіл — той самий ключ
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.schedule).toHaveLength(1);
  });

  it("назва вже є в overflow → мовчазний no-op, не дублює", () => {
    const existing: SolverResult = {
      schedule: [],
      overflow: [{ title: "стоматолог", duration_min: 40, reason: "no_slot" }],
      deadlines: [],
    };
    const res = placeNewTasks([task("стоматолог")], existing, new Map(), false);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.schedule).toHaveLength(0);
    expect(existing.overflow).toHaveLength(1);
  });

  it("нова фіксована конфліктує з існуючою → ok:false, нічого не змінює", () => {
    const existing: SolverResult = { schedule: [scheduled("робота", "09:00", 60, "fixed")], overflow: [], deadlines: [] };
    const res = placeNewTasks([task("зустріч", "09:15")], existing, new Map(), false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]).toMatchObject({ newTitle: "зустріч", withTitle: "робота" });
    }
    // Нічого не мутовано — та сама одна задача, той самий час.
    expect(existing.schedule).toEqual([scheduled("робота", "09:00", 60, "fixed")]);
  });

  it("resolve_conflict:true → існуючу зсуває на вільний слот, нова стає на заявлений час", () => {
    const existing: SolverResult = { schedule: [scheduled("робота", "09:00", 60, "fixed")], overflow: [], deadlines: [] };
    const res = placeNewTasks([task("зустріч", "09:15")], existing, new Map(), true);
    expect(res).toEqual({ ok: true, displaced: [] });
    const titles = existing.schedule.map((s) => s.title).sort();
    expect(titles).toEqual(["зустріч", "робота"]);
    const zustrich = existing.schedule.find((s) => s.title === "зустріч")!;
    expect(zustrich.start).toBe("09:15");
  });

  it("resolve_conflict:true і вільного часу нема → існуюча падає в overflow, з'являється в displaced", () => {
    // Весь пошуковий діапазон (07:00-21:00) зайнятий двома блокерами навколо "робота" —
    // коли нова "зустріч" займає точно її місце, зсунутій "робота" вже ніде подітися.
    const existing: SolverResult = {
      schedule: [
        scheduled("зранку", "07:00", 120, "fixed"), // 07:00–09:00
        scheduled("робота", "09:00", 60, "fixed"), // 09:00–10:00
        scheduled("до вечора", "10:00", 11 * 60, "fixed"), // 10:00–21:00
      ],
      overflow: [],
      deadlines: [],
    };
    const res = placeNewTasks([task("зустріч", "09:00")], existing, new Map(), true);
    expect(res).toEqual({ ok: true, displaced: ["робота"] });
    expect(existing.schedule.map((s) => s.title).sort()).toEqual(["до вечора", "зранку", "зустріч"]);
    expect(existing.overflow).toEqual([{ title: "робота", duration_min: 60, reason: "no_slot" }]);
  });

  it("гнучка без вільного місця → overflow, не кидає помилку", () => {
    // Робочий день майже повністю зайнятий довгою фіксованою справою.
    const existing: SolverResult = {
      schedule: [scheduled("марафон", "07:00", 14 * 60, "fixed")],
      overflow: [],
      deadlines: [],
    };
    const res = placeNewTasks([task("йога")], existing, new Map(), false);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.schedule).toHaveLength(1);
    expect(existing.overflow).toEqual([{ title: "йога", duration_min: 60, reason: "no_slot" }]);
  });

  it("дедлайн без fixed_time → у deadlines, не в schedule", () => {
    const existing = empty();
    const res = placeNewTasks([task("оплатити садок", null, "2026-09-25")], existing, new Map(), false);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(existing.deadlines).toEqual([{ title: "оплатити садок", date: "2026-09-25" }]);
    expect(existing.schedule).toHaveLength(0);
  });

  it("не чіпає вже позначені 'done'/'moved' пункти", () => {
    const done: Scheduled = { ...scheduled("вечеря", "18:00", 40), status: "done" };
    const existing: SolverResult = { schedule: [done], overflow: [], deadlines: [] };
    placeNewTasks([task("йога")], existing, new Map(), false);
    const vecherya = existing.schedule.find((s) => s.title === "вечеря");
    expect(vecherya?.status).toBe("done");
    expect(vecherya?.start).toBe("18:00");
  });

  it("minStartMinutes: гнучка нова задача не стає раніше за поточний момент дня", () => {
    const existing = empty();
    const elevenAm = 11 * 60;
    const res = placeNewTasks([task("зателефонувати лікарю")], existing, new Map(), false, elevenAm);
    expect(res).toEqual({ ok: true, displaced: [] });
    expect(toMin(existing.schedule[0].start)).toBeGreaterThanOrEqual(elevenAm);
  });

  it("minStartMinutes: конфліктну ІСНУЮЧУ задачу теж не зсуває в минуле дня", () => {
    const existing: SolverResult = { schedule: [scheduled("робота", "12:00", 60, "fixed")], overflow: [], deadlines: [] };
    const elevenAm = 11 * 60;
    const res = placeNewTasks([task("зустріч", "12:15")], existing, new Map(), true, elevenAm);
    expect(res).toEqual({ ok: true, displaced: [] });
    const robota = existing.schedule.find((s) => s.title === "робота")!;
    expect(toMin(robota.start)).toBeGreaterThanOrEqual(elevenAm);
  });
});
