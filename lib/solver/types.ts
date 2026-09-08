// Вихід solver-а = успішна відповідь /api/plan (docs/CONTRACT.md розділ 4).

export type ScheduledType = "fixed" | "flexible";

export interface Scheduled {
  title: string;
  start: string; // "HH:MM"
  duration_min: number;
  type: ScheduledType;
  // Етап 2: "→ завтра" (крок 4 спеку). Solver ніколи не ставить; лише збереження/UI.
  status?: "moved";
}

export type OverflowReason = "no_slot" | "conflict";

export interface OverflowItem {
  title: string;
  duration_min: number;
  reason: OverflowReason;
}

export interface Deadline {
  title: string;
  date: string; // "YYYY-MM-DD"
}

export interface SolverResult {
  schedule: Scheduled[];
  overflow: OverflowItem[];
  deadlines: Deadline[];
}

// Парсер не впізнав жодної справи (сміття/емодзі/непов'язані слова) —
// schedule/overflow/deadlines усі порожні одночасно.
export function isEmptyResult(r: SolverResult): boolean {
  return r.schedule.length === 0 && r.overflow.length === 0 && r.deadlines.length === 0;
}
