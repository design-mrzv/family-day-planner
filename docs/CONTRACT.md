# CONTRACT.md — контракт даних (Етапи 1-4)

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

## 12. Cron — вечірній пінг і ранкова видача (ІСТОРИЧНЕ — замінено в Етапі 4)

⚠️ Цей розділ описує механізм Етапу 3 (фіксований раз-на-добу Vercel cron,
`telegram_chat_id`). **Він більше не діє** — `/api/cron/*` тепер працюють по-іншому,
див. розділ 14. Лишено для історії (чому взагалі виникла потреба в Етапі 4).

Старий механізм: `vercel.json` з двома завданнями раз на добу за фіксованим UTC-часом
(~19:00/~07:00 Europe/Kyiv), розсилка через `telegram_chat_id`. Проблема: для
користувача не за Києвом (напр. Чикаго) фіксований час — це або середина дня, або
глибока ніч за його реальним годинником, не вечір/ранок. Виявлено живим тестуванням
(розділ 14 — чому саме зовнішній погодинний тригер, а не просто інший фіксований час).

## 13. Часовий пояс (`resolveTimezone`, `lib/timezone.ts`)

Telegram не передає часовий пояс користувача — **ніколи не вгадуємо** (той самий
принцип, що й `time_hint` у розділі 2). Приймає (через `POST /api/timezone` у вебі —
Етап 4, раніше через команду `/timezone` в боті), у порядку спроб:

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

---

# Етап 4 — Web Push (заміна Telegram)

Причина: Етап 3 виявив фундаментальний розрив — Vercel Cron фіксований на глобальному
UTC-часі, а користувач хоче реальну доставку о своїй **локальній** ранковій/вечірній
годині. **Vercel Hobby дозволяє нативний крон не частіше разу на добу** (офіційно
задокументовано, частіший вираз провалює деплой) — per-user timezone логіка на ньому
неможлива. Рішення: зовнішній безкоштовний погодинний тригер + канал доставки —
web push замість Telegram (рішення користувача: не тримати окремий бот-застосунок,
увесь ввід/вивід — у веб).

## 14. Схема БД (доповнення до розділу 6/10)

```sql
users(
  ...,
  last_evening_ping_date DATE  -- дедуп вечірнього пінгу, той самий принцип, що
                                 -- daily_plans.delivered_at для ранкової видачі
)

push_subscriptions(
  id UUID PK,
  user_id UUID FK → users,
  endpoint TEXT UNIQUE NOT NULL,  -- ідентифікатор підписки браузера; по суті замінює
                                    -- telegram_chat_id, але користувач може мати кілька
                                    -- (кілька пристроїв) — на відміну від одного чату
  p256dh TEXT NOT NULL,           -- ключі шифрування payload, вимагає Push API
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ
)
```

## 15. Підписка на push

**`GET /api/timezone`** / **`POST /api/timezone`** (вимагає сесію) — читання й запис
`users.timezone`, веб-заміна команди `/timezone` (розділ 13).

**`POST /api/push/subscribe`** (вимагає сесію) — вхід: `PushSubscription.toJSON()`
з браузера (`{ endpoint, keys: { p256dh, auth } }`). UPSERT за `endpoint` (глобально
унікальний, той самий пристрій повторно підписується поверх себе).

Клієнт (`app/Planner.tsx`): кнопка «Увімкнути сповіщення» → `serviceWorker.register("/sw.js")`
→ `Notification.requestPermission()` → `pushManager.subscribe()` (VAPID public key,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) → POST на `/api/push/subscribe`.

**iOS Safari обмеження (системне, Apple, не обійти кодом):** push працює лише для
сайтів, доданих на головний екран (iOS 16.4+). Детект (`navigator.userAgent` +
`navigator.standalone`) показує інструкцію "Поділитися → На головний екран" замість
кнопки, коли сайт відкрито у звичайній вкладці Safari.

`app/manifest.ts` + `public/icon.png` — мінімальний маніфест для installability
(Android/Chrome "Install", iOS "На головний екран"). Іконка — суцільний квадрат,
суто функціональна, не дизайн-рішення (дизайн — Етап 5).

## 16. Погодинний тригер (заміна розділу 12)

`vercel.json` **видалено** (native cron більше не використовується). Перша спроба —
**GitHub Actions** (`schedule: "0 * * * *"`) — виявилась ненадійною: GitHub офіційно
попереджає, що `schedule`-запуски best-effort, і для тихих/нових репо спостерігались
затримки на кілька годин (підтверджено живим тестом: розрив між тіками сягав 3-5 год
замість обіцяної години). **Замінено на [cron-job.org](https://cron-job.org)**
(безкоштовний, спеціалізований HTTP-крон-сервіс, до 60 запусків/год) — два завдання
(`family-planner: evening-ping`, `family-planner: morning-delivery`), кожне погодинно
(`minutes: [0]`, `hours: [-1]` — щогодини), б'ють `GET` у наші ендпоінти з кастомним
заголовком `Authorization: Bearer $CRON_SECRET` (через `extendedData.headers`).
Налаштовано через їхній REST API (`PUT https://api.cron-job.org/jobs`), не вручну
через UI.

Роути (`app/api/cron/evening-ping`, `app/api/cron/morning-delivery`) самі фільтрують,
кому зараз слати — `hourInTz(user.timezone)` (`lib/timezone.ts`) порівнюється з
цільовою годиною (19 увечері, 7 вранці). Джерело користувачів — `push_subscriptions`
(join, не `telegram_chat_id`). Дедуп: `users.last_evening_ping_date` (evening) /
`daily_plans.delivered_at` (morning) — обидва виставляються лише якщо хоч одна push-
відправка користувачу реально вдалась.

`lib/push.ts` — `sendPush()`: 404/410 від браузера (підписка мертва — вимкнули
сповіщення/видалили PWA) мовчки прибирає рядок з `push_subscriptions`, це не помилка.

## 17. Статус Telegram-коду (Етап 3)

Розділи 10-11 (схема `telegram_chat_id`/`telegram_link_codes`, webhook) технічно ще в
коді — **АЛЕ крон-роути (розділ 16) більше не шлють через Telegram**, лише push.
Кнопку "Підключити Telegram" в UI прибрано. Це свідомо тимчасовий стан: код прибирається
окремим кроком після живого спостереження за кількома реальними циклами push-доставки
(той самий принцип, що й гейт Етапу 3 — реальний час, без ручного тригера).
