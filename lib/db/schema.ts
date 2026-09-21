import { pgTable, uuid, text, timestamp, date, jsonb, integer, unique } from "drizzle-orm/pg-core";

// Етап 2 — памʼять. Схема узгоджена в докстрінгу вище рівня коду (сесія 2026-09-07).

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // IANA timezone (напр. "Europe/Kyiv", "America/Chicago"). Визначає, що вважати "завтра"
  // при вечірньому вводі й "сьогодні" при ранковій видачі. Явно задається через
  // POST /api/timezone — не вгадуємо.
  timezone: text("timezone").notNull().default("Europe/Kyiv"),
  // Етап 4: дата (в поясі users.timezone), за яку вже пінганули "що на завтра?" —
  // дедуп для погодинного крону, той самий принцип, що dailyPlans.deliveredAt.
  lastEveningPingDate: date("last_evening_ping_date"),
  // Етап 4 (шеринг): SHA-256 хеш read-only посилання для партнера, не сирий токен —
  // токен довгоживучий і дає доступ до розкладу, тому за витоку БД лишається непридатним.
  // NULL, поки не згенеровано; перегенерація перезаписує — стара версія одразу відмирає.
  shareTokenHash: text("share_token_hash").unique(),
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
    // Етап 3: ранкова видача позначає тут — щоб cron не надіслав те саме двічі
    // (Vercel може ретраїти виклик; user, редагуючи вечірній ввід, не мусить це скидати).
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
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

// Ручний вибір кольору задачі (Етап 5, раунд 4) — точна копія durationOverrides.
// color_index: 1-6, індекс у палітрі --palette-1..6 (app/globals.css). Свідомо НЕ
// категорія — людина сама обирає колір, ніякого сенсу за замовчуванням не закладено.
export const taskColors = pgTable(
  "task_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    taskKey: text("task_key").notNull(),
    colorIndex: integer("color_index").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.taskKey)],
);

// Назви, які людина явно прибрала з пропозицій "Рутинні задачі" (Етап 5,
// раунд 8) — постійний per-user ігнор-список, точна копія taskColors без
// "значення": сама наявність рядка і є прапорцем. Не чіпає сам розклад/парсинг,
// лише фільтрує lib/routine.ts на етапі підказки.
export const ignoredRoutines = pgTable(
  "ignored_routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    taskKey: text("task_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.taskKey)],
);

// Етап 4: Web Push замість Telegram. endpoint — унікальний ідентифікатор підписки
// браузера (по суті замінює telegram_chat_id); p256dh/auth — ключі шифрування payload,
// які вимагає Push API. Один користувач може мати кілька підписок (кілька пристроїв).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
