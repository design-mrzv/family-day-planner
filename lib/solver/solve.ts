import type { Task } from "../parser/schema";
import type { SolverResult, Scheduled, OverflowItem, Deadline } from "./types";
import {
  WORK_START,
  WORK_END,
  FLEXIBLE_END,
  BUFFER_MIN,
  toMin,
  toHHMM,
  durationFor,
  ruleWindow,
  travelBufferFor,
} from "./config";

interface Interval {
  start: number;
  end: number;
  buffer: number; // мінімальний відступ до цієї справи (збори+дорога), понад BUFFER_MIN
}

// Чи вміщується [s, s+d] у вільне місце з буфером до кожної зайнятої справи.
function fits(s: number, d: number, occupied: Interval[]): boolean {
  for (const o of occupied) {
    const gap = Math.max(BUFFER_MIN, o.buffer);
    const clear = s >= o.end + gap || s + d <= o.start - gap;
    if (!clear) return false;
  }
  return true;
}

// Найраніший старт для гнучкої справи у вікні [lo, hi] з тривалістю d. null — не влізає.
function placeFlexible(lo: number, hi: number, d: number, occupied: Interval[]): number | null {
  const lo2 = Math.max(lo, toMin(WORK_START));
  const hi2 = Math.min(hi, toMin(FLEXIBLE_END)); // остання година перед сном — захищена

  if (lo2 + d > hi2) return null;

  // Кандидати: початок вікна + одразу після кожної зайнятої справи (з її буфером).
  const candidates = [lo2, ...occupied.map((o) => o.end + Math.max(BUFFER_MIN, o.buffer))]
    .filter((s) => s >= lo2 && s + d <= hi2)
    .sort((a, b) => a - b);

  for (const s of candidates) if (fits(s, d, occupied)) return s;
  return null;
}

// Детермінований розкладальник. Той самий вхід → той самий вихід.
export function solve(tasks: Task[]): SolverResult {
  const schedule: Scheduled[] = [];
  const overflow: OverflowItem[] = [];
  const deadlines: Deadline[] = [];

  // 7. Дедлайни (deadline != null і без fixed_time) → окремий блок, не в розклад дня.
  //    Крайовий випадок: є і fixed_time, і deadline → fixed_time виграє (лишається в дні).
  const dayTasks: Task[] = [];
  for (const t of tasks) {
    if (t.deadline && !t.fixed_time) deadlines.push({ title: t.title, date: t.deadline });
    else dayTasks.push(t);
  }

  const fixed = dayTasks.filter((t) => t.fixed_time);
  const flexible = dayTasks.filter((t) => !t.fixed_time);

  // 4. Фіксовані справи на свої місця + виявлення конфліктів (накладень).
  const fixedIvs = fixed.map((t) => {
    const start = toMin(t.fixed_time as string);
    return { task: t, start, end: start + durationFor(t.title) };
  });

  const conflicted = new Set<number>();
  for (let i = 0; i < fixedIvs.length; i++) {
    for (let j = i + 1; j < fixedIvs.length; j++) {
      const a = fixedIvs[i];
      const b = fixedIvs[j];
      if (a.start < b.end && b.start < a.end) {
        conflicted.add(i);
        conflicted.add(j);
      }
    }
  }

  const occupied: Interval[] = [];
  fixedIvs.forEach((iv, idx) => {
    const duration_min = iv.end - iv.start;
    if (conflicted.has(idx)) {
      // Обидві конфліктні справи → overflow. Жодна не займає слот довільно.
      overflow.push({ title: iv.task.title, duration_min, reason: "conflict" });
    } else {
      schedule.push({ title: iv.task.title, start: toHHMM(iv.start), duration_min, type: "fixed" });
      occupied.push({ start: iv.start, end: iv.end, buffer: travelBufferFor(iv.task.title) });
    }
  });

  // 5. Гнучкі справи у вільні вікна, поважаючи правила + буфери.
  //    Спершу справи з правилом (вужче вікно), потім решта — у порядку вводу.
  const meta = flexible.map((t, i) => {
    const rw = ruleWindow(t.title);
    const [lo, hi] = rw ?? [toMin(WORK_START), toMin(WORK_END)];
    return { task: t, i, lo, hi, d: durationFor(t.title), constrained: rw != null };
  });
  meta.sort((a, b) => Number(b.constrained) - Number(a.constrained) || a.i - b.i);

  for (const m of meta) {
    const start = placeFlexible(m.lo, m.hi, m.d, occupied);
    if (start == null) {
      // 6. Що не влізло → overflow. НЕ стискаємо, НЕ викидаємо мовчки.
      overflow.push({ title: m.task.title, duration_min: m.d, reason: "no_slot" });
    } else {
      schedule.push({ title: m.task.title, start: toHHMM(start), duration_min: m.d, type: "flexible" });
      occupied.push({ start, end: start + m.d, buffer: travelBufferFor(m.task.title) });
    }
  }

  schedule.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { schedule, overflow, deadlines };
}
