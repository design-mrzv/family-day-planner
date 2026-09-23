import { z } from "zod";

// Формати з docs/CONTRACT.md.
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM, 24h
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

// Розмита вказівка часу доби (LLM фіксує лише сказане в тексті, не вгадує).
export const TimeHintSchema = z.enum(["morning", "afternoon", "evening"]).nullable();

// Одна справа у виводі LLM-парсера.
// strictObject: зайві поля відхиляються — LLM НЕ оцінює/вгадує час.
// duration_min — виняток: не оцінка, а ВИТЯГУВАННЯ явно написаного людиною числа
// ("(30 хв)"), той самий клас дії, що fixed_time/deadline. Solver і далі призначає
// тривалість сам, якщо в тексті нічого не вказано (null).
export const TaskSchema = z.strictObject({
  title: z.string().trim().min(1),
  fixed_time: z.string().regex(TIME_RE).nullable(),
  deadline: z.string().regex(DATE_RE).nullable(),
  time_hint: TimeHintSchema,
  duration_min: z.number().int().min(5).max(480).nullable(),
});

// Повний вивід парсера: { tasks: [...] }, нічого крім цього.
export const ParsedTasksSchema = z.strictObject({
  tasks: z.array(TaskSchema),
});

export type Task = z.infer<typeof TaskSchema>;
export type ParsedTasks = z.infer<typeof ParsedTasksSchema>;
