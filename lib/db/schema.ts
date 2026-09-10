import { pgTable, uuid, text, timestamp, date, jsonb, integer, unique } from "drizzle-orm/pg-core";

// Етап 2 — памʼять. Схема узгоджена в докстрінгу вище рівня коду (сесія 2026-09-07).

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Етап 3: другий ідентифікатор, привʼязується через deep-link код (telegram_link_codes).
  telegramChatId: text("telegram_chat_id").unique(),
  // IANA timezone (напр. "Europe/Kyiv", "America/Chicago"). Визначає, що вважати "завтра"
  // при вечірньому вводі й "сьогодні" при ранковій видачі. Явно задається командою
  // /timezone в боті — не вгадуємо (Telegram не передає TZ користувача).
  timezone: text("timezone").notNull().default("Europe/Kyiv"),
  // Етап 4: дата (в поясі users.timezone), за яку вже пінганули "що на завтра?" —
  // дедуп для погодинного крону, той самий принцип, що dailyPlans.deliveredAt.
  lastEveningPingDate: date("last_evening_ping_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Одноразовий код прив'язки Telegram: веб-сесія генерує код → deep-link t.me/bot?start=код →
// бот отримує /start код → знаходить цей рядок → пише telegram_chat_id в users.
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
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
