import type { Task } from "../parser/schema";
import type { SolverResult, Scheduled } from "./types";
import { WORK_START, WORK_END, toMin, toHHMM, durationFor, normalizeTaskKey, ruleWindow, windowForHint } from "./config";
import { overlaps, findFreeSlot, placeFlexible, type Interval, type DurationOverrides } from "./solve";

export interface AddConflict {
  newTitle: string;
  withTitle: string;
  withStart: string;
  withDurationMin: number;
}

function occupiedFrom(schedule: Scheduled[]): Interval[] {
  return schedule
    .filter((s) => s.status !== "moved")
    .map((s) => ({ start: toMin(s.start), end: toMin(s.start) + s.duration_min, buffer: 0 }));
}

function resolveDuration(title: string, overrides: DurationOverrides): number {
  return overrides.get(normalizeTaskKey(title)) ?? durationFor(title);
}

// Додавання нової(их) задачі(задач) в УЖЕ ІСНУЮЧИЙ розклад дня (Етап 5, FAB "Сьогодні") —
// на відміну від solve(), який будує schedule з нуля. Мутує existing на місці (той самий
// стиль, що move/complete/reschedule/move-to-free-slot), перевикористовує лише вже
// експортовані примітиви — жодної нової логіки розкладання.
export function placeNewTasks(
  newTasks: Task[],
  existing: SolverResult,
  durationOverrides: DurationOverrides,
  resolveConflicts: boolean,
  minStartMinutes = 0,
): { ok: true; displaced: string[] } | { ok: false; conflicts: AddConflict[] } {
  const dayTasks: Task[] = [];
  for (const t of newTasks) {
    if (t.deadline && !t.fixed_time) existing.deadlines.push({ title: t.title, date: t.deadline });
    else dayTasks.push(t);
  }

  const fixed = dayTasks.filter((t) => t.fixed_time);
  const flexible = dayTasks.filter((t) => !t.fixed_time);

  // Фіксовані спершу — по черзі проти occupied, що зростає з кожною щойно розміщеною
  // (нові фіксовані задачі ловлять конфлікт і між собою, не тільки з існуючими).
  const conflicts: AddConflict[] = [];
  // Задачі, яких довелось зсунути через конфлікт, але для яких не знайшлось вільного
  // часу — впали в overflow "мовчки" з погляду solver-а. Фронтенд показує про це попап
  // (submit-підтвердження "перенести" не мало б виглядати успішним, якщо результат —
  // задача взагалі випала з розкладу дня).
  const displaced: string[] = [];
  for (const t of fixed) {
    const d = resolveDuration(t.title, durationOverrides);
    const start = toMin(t.fixed_time as string);
    const end = start + d;

    const clashing = existing.schedule.filter((s) => s.status !== "moved" && overlaps(start, end, toMin(s.start), toMin(s.start) + s.duration_min));

    if (clashing.length > 0) {
      if (!resolveConflicts) {
        for (const c of clashing) conflicts.push({ newTitle: t.title, withTitle: c.title, withStart: c.start, withDurationMin: c.duration_min });
        continue;
      }
      for (const c of clashing) {
        const freeStart = findFreeSlot(c.duration_min, occupiedFrom(existing.schedule.filter((s) => s !== c)), minStartMinutes);
        if (freeStart != null) c.start = freeStart;
        else {
          existing.schedule = existing.schedule.filter((s) => s !== c);
          existing.overflow.push({ title: c.title, duration_min: c.duration_min, reason: "no_slot" });
          displaced.push(c.title);
        }
      }
    }

    existing.schedule.push({ title: t.title, start: toHHMM(start), duration_min: d, type: "fixed" });
  }

  if (conflicts.length > 0 && !resolveConflicts) return { ok: false, conflicts };

  // Гнучкі — у вільне вікно, той самий пріоритет правил, що solve().
  for (const t of flexible) {
    const d = resolveDuration(t.title, durationOverrides);
    const rw = ruleWindow(t.title) ?? windowForHint(t.time_hint);
    const [lo, hi] = rw ?? [toMin(WORK_START), toMin(WORK_END)];
    const occupied = occupiedFrom(existing.schedule);
    const start = placeFlexible(Math.max(lo, minStartMinutes), hi, d, occupied);
    if (start == null) {
      existing.overflow.push({ title: t.title, duration_min: d, reason: "no_slot" });
    } else {
      existing.schedule.push({ title: t.title, start: toHHMM(start), duration_min: d, type: "flexible" });
    }
  }

  existing.schedule.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { ok: true, displaced };
}
