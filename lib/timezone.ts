// Часові хелпери, спільні для будь-якого каналу доставки (раніше жили в lib/telegram.ts —
// винесено в Етапі 4, коли доставка стала не Telegram-специфічною).

export const DEFAULT_TIMEZONE = "Europe/Kyiv"; // цільова аудиторія спеку; users.timezone default

// Поточна дата в заданому IANA-поясі (не сервера — Vercel serverless працює в UTC).
// offsetDays: 0 = сьогодні, 1 = завтра.
export function dateStringInTz(timezone: string, offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Поточна година (0-23) в заданому IANA-поясі — для погодинного тригера (Етап 4):
// крон стукає раз на годину, а надсилає лише тим, у кого зараз цільова локальна година.
export function hourInTz(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(),
  );
  return Number(parts.find((p) => p.type === "hour")?.value);
}

// Валідний IANA timezone-рядок? (Intl кидає RangeError на невідомий/сміттєвий рядок.)
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Найчастіші міста, які по-різному пишуться в IANA (Україна — суцільно Europe/Kyiv,
// стара назва "Kiev" теж трапляється) або їх немає в базі як окремого запису.
const CITY_ALIASES: Record<string, string> = {
  "київ": "Europe/Kyiv",
  kyiv: "Europe/Kyiv",
  kiev: "Europe/Kyiv",
  "львів": "Europe/Kyiv",
  lviv: "Europe/Kyiv",
  "одеса": "Europe/Kyiv",
  odesa: "Europe/Kyiv",
  odessa: "Europe/Kyiv",
  "харків": "Europe/Kyiv",
  kharkiv: "Europe/Kyiv",
  "дніпро": "Europe/Kyiv",
  dnipro: "Europe/Kyiv",
  "запоріжжя": "Europe/Kyiv",
  zaporizhzhia: "Europe/Kyiv",
  "вінниця": "Europe/Kyiv",
  vinnytsia: "Europe/Kyiv",
  // Іспанія — теж один пояс на всю країну (крім Канарських), IANA знає лише Madrid.
  "валенсія": "Europe/Madrid",
  valencia: "Europe/Madrid",
  "малага": "Europe/Madrid",
  malaga: "Europe/Madrid",
  "барселона": "Europe/Madrid",
  barcelona: "Europe/Madrid",
  "севілья": "Europe/Madrid",
  sevilla: "Europe/Madrid",
  seville: "Europe/Madrid",

  // --- Рівень країни: тільки для країн з ОДНИМ поясом на всю територію.
  // Багатозонні (США/Канада/Австралія/Росія/Бразилія тощо) свідомо не додаємо
  // сюди — там немає єдиної правильної відповіді, краще хай впишуть місто
  // (пошук по IANA-містах уже це покриває) або /timezone +N.
  "україна": "Europe/Kyiv",
  ukraine: "Europe/Kyiv",
  "німеччина": "Europe/Berlin",
  germany: "Europe/Berlin",
  deutschland: "Europe/Berlin",
  "іспанія": "Europe/Madrid",
  spain: "Europe/Madrid",
  "франція": "Europe/Paris",
  france: "Europe/Paris",
  "польща": "Europe/Warsaw",
  poland: "Europe/Warsaw",
  "італія": "Europe/Rome",
  italy: "Europe/Rome",
  "португалія": "Europe/Lisbon",
  portugal: "Europe/Lisbon",
  "нідерланди": "Europe/Amsterdam",
  netherlands: "Europe/Amsterdam",
  "бельгія": "Europe/Brussels",
  belgium: "Europe/Brussels",
  "австрія": "Europe/Vienna",
  austria: "Europe/Vienna",
  "швейцарія": "Europe/Zurich",
  switzerland: "Europe/Zurich",
  "чехія": "Europe/Prague",
  "czech republic": "Europe/Prague",
  czechia: "Europe/Prague",
  "словаччина": "Europe/Bratislava",
  slovakia: "Europe/Bratislava",
  "угорщина": "Europe/Budapest",
  hungary: "Europe/Budapest",
  "румунія": "Europe/Bucharest",
  romania: "Europe/Bucharest",
  "греція": "Europe/Athens",
  greece: "Europe/Athens",
  "швеція": "Europe/Stockholm",
  sweden: "Europe/Stockholm",
  "норвегія": "Europe/Oslo",
  norway: "Europe/Oslo",
  "данія": "Europe/Copenhagen",
  denmark: "Europe/Copenhagen",
  "фінляндія": "Europe/Helsinki",
  finland: "Europe/Helsinki",
  "ірландія": "Europe/Dublin",
  ireland: "Europe/Dublin",
  "великобританія": "Europe/London",
  "англія": "Europe/London",
  "uk": "Europe/London",
  "united kingdom": "Europe/London",
  england: "Europe/London",
  "туреччина": "Europe/Istanbul",
  turkey: "Europe/Istanbul",

  // --- Столиці (і "берлін") кирилицею: пошук по IANA — точний посимвольний збіг,
  // кирилиця з латиницею НІКОЛИ не зрівняється, навіть якщо місто саме там є
  // (напр. "Берлин" не знайде "Berlin"). Ті самі країни, що вище — лише інший запис.
  "берлін": "Europe/Berlin",
  "берлин": "Europe/Berlin",
  "варшава": "Europe/Warsaw",
  "париж": "Europe/Paris",
  "рим": "Europe/Rome",
  "мадрид": "Europe/Madrid",
  "лондон": "Europe/London",
  "відень": "Europe/Vienna",
  "вена": "Europe/Vienna",
  "прага": "Europe/Prague",
  "будапешт": "Europe/Budapest",
  "бухарест": "Europe/Bucharest",
  "афіни": "Europe/Athens",
  "афины": "Europe/Athens",
  "стокгольм": "Europe/Stockholm",
  "осло": "Europe/Oslo",
  "копенгаген": "Europe/Copenhagen",
  "гельсінкі": "Europe/Helsinki",
  "хельсинки": "Europe/Helsinki",
  "дублін": "Europe/Dublin",
  "дублин": "Europe/Dublin",
  "стамбул": "Europe/Istanbul",
  "амстердам": "Europe/Amsterdam",
  "брюссель": "Europe/Brussels",
  "брюссел": "Europe/Brussels",
  "цюрих": "Europe/Zurich",
  "цюріх": "Europe/Zurich",
  "братислава": "Europe/Bratislava",
  "лісабон": "Europe/Lisbon",
  "лиссабон": "Europe/Lisbon",

  // --- Великі міста США/Канади без ВЛАСНОГО запису в IANA (використовують пояс
  // найближчого офіційного міста — однозначно, на відміну від country-рівня, тут нема
  // неоднозначності: Х'юстон завжди Central, Маямі завжди Eastern). Англійською й
  // кирилицею одразу, бо жодна форма сама по собі не знайдеться пошуком.
  houston: "America/Chicago",
  хюстон: "America/Chicago", // апострофи нормалізуються геть у resolveTimezone нижче
  dallas: "America/Chicago",
  даллас: "America/Chicago",
  atlanta: "America/Chicago",
  атланта: "America/Chicago",
  austin: "America/Chicago",
  остін: "America/Chicago",
  остин: "America/Chicago",
  miami: "America/New_York",
  маямі: "America/New_York",
  майами: "America/New_York",
  boston: "America/New_York",
  бостон: "America/New_York",
  washington: "America/New_York",
  вашингтон: "America/New_York",
  philadelphia: "America/New_York",
  філадельфія: "America/New_York",
  филадельфия: "America/New_York",
  seattle: "America/Los_Angeles",
  сіетл: "America/Los_Angeles",
  сиэтл: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  "сан-франциско": "America/Los_Angeles",
  "san diego": "America/Los_Angeles",
  "лас-вегас": "America/Los_Angeles",
  "las vegas": "America/Los_Angeles",
  portland: "America/Los_Angeles",
  портленд: "America/Los_Angeles",
  montreal: "America/Toronto",
  монреаль: "America/Toronto",
  ottawa: "America/Toronto",
  оттава: "America/Toronto",
  calgary: "America/Edmonton",
  калгарі: "America/Edmonton",

  // --- Кирилична форма міст, які латиницею вже знаходяться пошуком по IANA.
  чикаго: "America/Chicago",
  "нью-йорк": "America/New_York",
  "лос-анджелес": "America/Los_Angeles",
  денвер: "America/Denver",
  фінікс: "America/Phoenix",
  финикс: "America/Phoenix",
  торонто: "America/Toronto",
  ванкувер: "America/Vancouver",
  сідней: "Australia/Sydney",
  сидней: "Australia/Sydney",
  мельбурн: "Australia/Melbourne",
  брісбен: "Australia/Brisbane",
  перт: "Australia/Perth",

  // --- Великі європейські міста поза столицями (Німеччина/Італія/Франція/Польща —
  // теж однопоясні країни, ловилося б і рівнем країни, але пряме місто зручніше).
  frankfurt: "Europe/Berlin",
  франкфурт: "Europe/Berlin",
  munich: "Europe/Berlin",
  "münchen": "Europe/Berlin",
  мюнхен: "Europe/Berlin",
  hamburg: "Europe/Berlin",
  гамбург: "Europe/Berlin",
  cologne: "Europe/Berlin",
  köln: "Europe/Berlin",
  кельн: "Europe/Berlin",
  milan: "Europe/Rome",
  milano: "Europe/Rome",
  "мілан": "Europe/Rome",
  "милан": "Europe/Rome",
  naples: "Europe/Rome",
  неаполь: "Europe/Rome",
  marseille: "Europe/Paris",
  марсель: "Europe/Paris",
  lyon: "Europe/Paris",
  ліон: "Europe/Paris",
  лион: "Europe/Paris",
  krakow: "Europe/Warsaw",
  "kraków": "Europe/Warsaw",
  краків: "Europe/Warsaw",
  краков: "Europe/Warsaw",
  gdansk: "Europe/Warsaw",
  "gdańsk": "Europe/Warsaw",
  гданськ: "Europe/Warsaw",
};

// "+2", "-5", "UTC+2", "GMT-5" → Etc/GMT∓N (в IANA цей запис історично з ІНВЕРТОВАНИМ
// знаком — Etc/GMT-2 це UTC+2). Фолбек, що працює для будь-якого міста на Землі, коли
// назва не впізнана — не тримати ж список усіх міст світу вручну.
function resolveUtcOffset(input: string): string | null {
  const m = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})$/i.exec(input);
  if (!m) return null;
  const hours = Number(m[2]);
  if (hours > 14) return null; // немає таких поясів
  if (hours === 0) return "Etc/UTC";
  const inverted = m[1] === "+" ? "-" : "+";
  return `Etc/GMT${inverted}${hours}`;
}

// Приймає довільний ввід — повну IANA-назву ("America/Chicago"), просто місто
// ("Чикаго"/"Chicago") або зсув від UTC ("+2") — і повертає канонічний IANA-рядок,
// або null, якщо не впізнала (нема сенсу вгадувати навмання: краще перепитати,
// ніж мовчки взяти не той пояс).
export function resolveTimezone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isValidTimezone(trimmed)) return trimmed;

  // Апостроф в укр. транслітерації (Х'юстон) пишуть по-різному залежно від клавіатури
  // (' ’ ʼ) — нормалізуємо геть, щоб не залежати від конкретного символу.
  const key = trimmed.toLowerCase().replace(/['’‘ʼʻ`´]/g, "");
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];

  const offset = resolveUtcOffset(trimmed);
  if (offset) return offset;

  const normalized = key.replace(/\s+/g, "_");
  const matches = Intl.supportedValuesOf("timeZone").filter((zone) => {
    const city = zone.slice(zone.lastIndexOf("/") + 1).toLowerCase();
    return city === normalized;
  });
  return matches.length === 1 ? matches[0] : null;
}
