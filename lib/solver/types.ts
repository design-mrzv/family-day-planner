// Вихід solver-а = успішна відповідь /api/plan (docs/CONTRACT.md розділ 4).

export type ScheduledType = "fixed" | "flexible";

export interface Scheduled {
  title: string;
  start: string; // "HH:MM"
  duration_min: number;
  type: ScheduledType;
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
