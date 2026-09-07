import { pgTable, uuid, text, timestamp, date, jsonb, integer, unique } from "drizzle-orm/pg-core";

// Етап 2 — памʼять. Схема узгоджена в докстрінгу вище рівня коду (сесія 2026-09-07).

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Одноразові токени для входу через email-посилання (magic link).
export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Розклад одного дня одного користувача. tasks — розширений Task+Scheduled зі статусом
// ("pending" | "done" | "skipped" | "moved"), джерело для памʼяті рутини (агрегація за
// останні N днів) і для інвертованої дії "→ завтра".
export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    inputText: text("input_text").notNull(),
    tasks: jsonb("tasks").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.date)],
);

// Правки тривалості від користувача. task_key — нормалізована назва (lowercase, trim),
// точний збіг, без fuzzy-пошуку. Solver перевіряє цю таблицю перед словником дефолтів.
export const durationOverrides = pgTable(
  "duration_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    taskKey: text("task_key").notNull(),
    durationMin: integer("duration_min").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.taskKey)],
);
