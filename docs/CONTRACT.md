# CONTRACT.md — контракт даних (Етап 1 + Етап 2)

> Джерело істини для меж між компонентами. Заморожено й узгоджено до коду.
> Змінювати тільки свідомо й з окремим комітом. Продуктовий контекст: `PRODUCT_SPEC_v2.md`,
> порядок білду: `BUILD_PLAN.md`.

## Архітектурне правило (не переговорюється)

- **LLM тільки парсить текст → JSON.** LLM НЕ оцінює тривалості й НЕ розкладає час.
- **Solver — детермінований код** (цикли й перевірки). Тривалості призначає solver зі
  словника дефолтів. Без зовнішніх solver-бібліотек, без оптимізації.
- Вивід LLM валідуємо схемою. Смітт → один ретрай → чесна помилка. Без другої моделі.

## Формати (скрізь)

- Час: `"HH:MM"`, 24-годинний (напр. `"08:00"`, `"15:00"`).
- Дата: `"YYYY-MM-DD"` (напр. `"2026-09-08"`).

---

## 1. Вхід у LLM-парсер

```json
{ "text": "сирий текст мами", "today": "2026-09-05" }
```

## 2. Вихід LLM-парсера (строга схема, нічого крім цього JSON)

```json
{
  "tasks": [
    { "title": "забрати старшого", "fixed_time": "15:00", "deadline": null, "time_hint": null },
    { "title": "тренування",       "fixed_time": null,    "deadline": null, "time_hint": null },
    { "title": "оплатити садок",    "fixed_time": null,    "deadline": "2026-09-08", "time_hint": null },
    { "title": "щось приготувати", "fixed_time": null,    "deadline": null, "time_hint": "evening" }
  ]
}
```

Правила поля:
- `title` — рядок, обовʼязковий, непорожній. Без слів-маркерів часу доби всередині (ідуть у `time_hint`).
- `fixed_time` — `"HH:MM"` або `null`.
- `deadline` — `"YYYY-MM-DD"` або `null`. **Тільки для реальної календарної дати/дня тижня.**
  Розмита вказівка часу протягом сьогодні ("до 15", "до вечора") — НЕ deadline, `null`.
- `time_hint` — `"morning" | "afternoon" | "evening" | null`. LLM фіксує **лише буквально
  сказане** в тексті ("зранку"/"ввечері"/"на ніч" тощо), ніколи не вгадує з суті справи.
  Немає слова в тексті → `null`, навіть якщо справа "звучить" як вечірня.
- **`duration` тут ЗАБОРОНЕНИЙ.** Тривалість призначає лише solver.

## 3. Вхід у solver

`tasks[]` (розділ 2) + `rules` + `durations`.
На Етапі 1: `rules` — хардкод, `durations` — словник дефолтів + fallback 30 хв.
Це внутрішні константи solver-а (не міжкомпонентний контракт); форму фіксуємо в 1.4.

## 4. Вихід solver-а = успішна відповідь `/api/plan`

```json
{
  "schedule": [
    { "title": "тренування",      "start": "08:00", "duration_min": 60, "type": "flexible" },
    { "title": "забрати старшого", "start": "15:00", "duration_min": 30, "type": "fixed" }
  ],
  "overflow":  [ { "title": "зняти відео", "duration_min": 40, "reason": "no_slot" } ],
  "deadlines": [ { "title": "оплатити садок", "date": "2026-09-08" } ]
}
```

Правила поля:
- `schedule[].type` — `"fixed" | "flexible"`.
- `overflow[].reason` — `"no_slot" | "conflict"`. Один масив `overflow` на всі причини.
- `deadlines[]` — усе, де `deadline != null`.

## 5. Відповідь `/api/plan` при помилці

```json
{ "error": "parse_failed", "message": "Не вдалося розібрати текст. Спробуй ще раз." }
```

---

## Крайові правила (зафіксовані рішення)

1. `deadline != null` → справа йде в `deadlines[]`, **не** в `schedule`.
2. Справа має і `fixed_time`, і `deadline` одночасно → `fixed_time` виграє: ставимо в
   розклад на сьогодні, `deadline` ігноруємо (рідкісний edge, на Етапі 1 не ускладнюємо).
3. Конфлікт двох `fixed_time` (той самий слот) → **обидві** справи в `overflow` з
   `reason: "conflict"`. Жодна не займає слот довільно.
4. Overflow — першокласний очікуваний стан, не помилка. Нічого не стискаємо й не викидаємо
   мовчки.
5. `time_hint` — фолбек. Якщо `title` збігається з якимось хардкод-правилом solver-а
   (напр. "тренування" → зранку) — правило за ключовим словом виграє над `time_hint`.

---

# Етап 2 — памʼять

Ідентифікатор: email (magic link, без пароля). Зберігання: Vercel Postgres (Neon) +
Drizzle ORM. Авторизація: самопис (`jose`, HS256), не NextAuth — свідомий вибір під дух
проєкту («проста функція», без важких фреймворків там, де вистачає власного коду).

## 6. Схема БД (`lib/db/schema.ts`)

```sql
users(
  id UUID PK,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ
)

magic_links(
  id UUID PK,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,      -- SHA-256 сирого токена; сирий токен ніде не зберігається
  expires_at TIMESTAMPTZ NOT NULL,  -- TTL 15 хв
  used_at TIMESTAMPTZ,           -- NULL поки не використаний; заповнюється при verify (replay-захист)
  created_at TIMESTAMPTZ
)

daily_plans(
  id UUID PK,
  user_id UUID FK → users,
  date DATE NOT NULL,
  input_text TEXT NOT NULL,      -- сирий ввід мами (для дебагу й аудиту)
  tasks JSONB NOT NULL,          -- повний SolverResult { schedule, overflow, deadlines };
                                  -- schedule[].status?: "moved" (крок 4 спеку)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, date)          -- один запис на день; UPSERT перезаписує
)

duration_overrides(
  id UUID PK,
  user_id UUID FK → users,
  task_key TEXT NOT NULL,        -- normalizeTaskKey(title): lowercase + trim, точний збіг
  duration_min INT NOT NULL,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, task_key)
)
```

Міграції: `drizzle-kit generate` (SQL у `drizzle/`, комітиться) + `drizzle-kit migrate`
(застосовує до `POSTGRES_URL_NON_POOLING`). Голий CLI не читає `.env.local` — запускати
через `node --env-file=.env.local node_modules/.bin/drizzle-kit ...`.

## 7. Авторизація (magic link)

**`POST /api/auth/request-link`** — вхід: `{ "email": "mama@example.com" }`.
Генерує токен (32 байти, base64url), зберігає лише його SHA-256 хеш. У dev-режимі (email
ще не шлеться) повертає посилання прямо у відповіді:
```json
{ "ok": true, "devLink": "https://.../api/auth/verify?token=..." }
```

**`GET /api/auth/verify?token=...`** — перевіряє токен (не протермінований, не використаний
раніше), позначає використаним, створює користувача за email якщо новий, підписує сесію
(JWT HS256, `AUTH_SECRET`, 30 днів) і редиректить на `/` з httpOnly cookie `session`.
Невалідний/повторний токен → редирект на `/?auth_error=1`.

**`POST /api/auth/logout`** — очищує cookie `session`.

**Усі інші `/api/*` (крім auth-роутів)** тепер вимагають сесію:
```json
{ "error": "unauthorized", "message": "Потрібно увійти." }
```
з кодом `401`, якщо cookie відсутній/невалідний.

## 8. Памʼять тривалостей

**`POST /api/duration-override`** — вхід: `{ "title": "вечеря", "duration_min": 60 }`
(додатне ціле, ≤480). UPSERT у `duration_overrides` за `(user_id, normalizeTaskKey(title))`.

Solver (`solve(tasks, durationOverrides?)`) приймає другим аргументом
`Map<normalizeTaskKey(title), duration_min>`; якщо є збіг — виграє над дефолтним словником
(`lib/solver/config.ts`). Порожня Map за замовчуванням = поведінка Етапу 1.

`POST /api/plan` тепер, крім парсингу й розкладки: (1) підвантажує всі
`duration_overrides` користувача перед `solve()`; (2) після — UPSERT `daily_plans`
за `(user_id, today)`.

## 9. Памʼять рутини + «→ завтра»

**`GET /api/routine`** → `{ "prefill": "текст для textarea" }`. Логіка (`lib/routine.ts`,
чиста функція, без LLM):
1. Бере останні 7 записів `daily_plans` користувача.
2. **carry** — усі унікальні назви справ з **останнього** дня (schedule+overflow, дедуп
   за `normalizeTaskKey`) — включно з тими, що мають `status: "moved"`.
3. **routine** — назви, що зустрічались у **≥2 різних днях** з цих 7 (дедлайни не рахуються
   — вони одноразові).
4. Результат = carry + routine, дедуп за назвою (carry має пріоритет, routine нічого не
   дублює). **Час (`fixed_time`) не переноситься** — тільки текст назви.

**`POST /api/plan/move`** — вхід: `{ "date": "YYYY-MM-DD", "title": "..." }`. Знаходить
справу з цим `title` у `daily_plans.tasks.schedule` за вказану дату, ставить
`status: "moved"`. UI ховає такі справи з поточного дня; наступного дня вони природно
потрапляють у `carry` (крок 4 спеку: «незакрите мовчки падає в завтрашній інбокс»,
без лічильників і осуду).

---

# Етап 3 — доставка (Telegram)

Ідентифікатор розширюється: email (Етап 2) лишається, Telegram **додається** через
deep-link прив'язку — не замінює email-акаунт, а привʼязує `telegram_chat_id` до нього.

## 10. Схема БД (доповнення до розділу 6)

```sql
users(
  ...,                              -- як у розділі 6
  telegram_chat_id TEXT UNIQUE,     -- NULL, поки не привʼязано
  timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv'  -- IANA, явно задається /timezone
)

telegram_link_codes(
  id UUID PK,
  user_id UUID FK → users,
  code TEXT UNIQUE NOT NULL,        -- 12 hex-символів (randomBytes(6))
  expires_at TIMESTAMPTZ NOT NULL,  -- TTL 15 хв
  used_at TIMESTAMPTZ,              -- replay-захист, як magic_links
  created_at TIMESTAMPTZ
)

daily_plans(
  ...,                              -- як у розділі 6
  delivered_at TIMESTAMPTZ          -- NULL, поки не надіслано вранці;
                                     -- захист від дубля при ретраї cron
)
```

## 11. Прив'язка Telegram (deep-link)

**`POST /api/telegram/link`** (вимагає сесію) → `{ "deepLink": "https://t.me/<bot>?start=<код>" }`.
Генерує одноразовий код у `telegram_link_codes`, TTL 15 хв.

**`POST /api/telegram/webhook`** — приймає Telegram Update. Захист: заголовок
`X-Telegram-Bot-Api-Secret-Token` має збігатися з `TELEGRAM_WEBHOOK_SECRET`, інакше `401`.
Завжди повертає `{ "ok": true }` (Telegram не має ретраїти через наші внутрішні помилки —
вони логуються, не проброшуються назовні).

Розбір вхідного тексту:
- `/start <код>` → шукає код у `telegram_link_codes` (не використаний, не протермінований),
  ставить `used_at`, пише `telegram_chat_id` в `users`. Конфлікт (chat вже привʼязаний до
  іншого акаунта, код БД `23505`) → чесне повідомлення, **не** плутати з іншими помилками.
- `/timezone [місто|країна|IANA|+N]` — див. розділ 13.
- будь-який інший текст → вечірній ввід, трактується як справи на **завтра** (за
  `users.timezone` цього користувача): `planAndSaveDay(userId, text, dateStringInTz(tz, 1))`.
  Коротке підтвердження в чат («Записала N справ»), **не** повний розклад — той приходить
  окремо вранці (двотактний цикл, PRODUCT_SPEC_v2 розділ 4).

## 12. Cron — вечірній пінг і ранкова видача

`vercel.json`: два завдання, захищені `CRON_SECRET` (Vercel сам шле
`Authorization: Bearer $CRON_SECRET`, перевіряється в кожному роуті).

- **`GET /api/cron/evening-ping`** (~19:00 Europe/Kyiv) — усім із `telegram_chat_id` шле
  «Що плануєш на завтра?». Один глобальний час запуску (не per-user).
- **`GET /api/cron/morning-delivery`** (~07:00 Europe/Kyiv) — для кожного привʼязаного
  користувача рахує «сьогодні» **за його власним** `users.timezone`, шукає
  `daily_plans` на цю дату; є план і `delivered_at IS NULL` → шле повний розклад
  (`formatScheduleMessage`, той самий вигляд, що у веб-UI) і ставить `delivered_at`.
  Нема плану → мовчки пропускає (retention-етика, без нагадувань-докорів).

Часовий дрейф: глобальний час cron прив'язаний до Києва, тому користувач в іншому поясі
отримає повідомлення о іншій реальній годині (не о своїй 07:00) — але за **правильною
датою**, бо саме дата (не час доставки) рахується per-user.

## 13. Часовий пояс (`resolveTimezone`, `lib/telegram.ts`)

Telegram не передає часовий пояс користувача — **ніколи не вгадуємо** (той самий
принцип, що й `time_hint` у розділі 2). `/timezone <ввід>` приймає, у порядку спроб:

1. Повна IANA-назва як є (`America/Chicago`) — якщо `Intl` її вже визнає валідною.
2. Аліас-словник (`CITY_ALIASES`): столиці й великі міста кирилицею (латиниця здебільшого
   знаходиться прямим пошуком по IANA — але кирилиця з латиницею НІКОЛИ не збігаються
   посимвольно, навіть якщо місто там є); країни з **одним** поясом на всю територію
   (Україна, Німеччина, Польща...) — свідомо БЕЗ багатозонних (США/Канада/Австралія
   тощо), там нема єдиної правильної відповіді; великі міста США/Канади без власного
   запису в IANA (Х'юстон, Маямі — однозначні, на відміну від країни).
3. Пошук по всій базі `Intl.supportedValuesOf("timeZone")` за співпадінням назви міста.
4. Числовий зсув (`+2`, `UTC-5`, `GMT+3`) → `Etc/GMT∓N` (в IANA цей запис зі свідомо
   **інвертованим** знаком). Універсальний фолбек для будь-якої точки на Землі.

Нічого не впізнано → `null`, чесне повідомлення з підказками, не приблизний здогад.
Апострофи в транслітерації (`Х'юстон`/`Х’юстон`/`Х‘юстон`) нормалізуються перед
пошуком — інакше різні клавіатури дають різний символ і матчинг ламається.
