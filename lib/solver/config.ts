// Хардкод-конфіг solver-а на Етапі 1: робоче вікно, буфер, дефолтні тривалості, правила.
// На Етапі 2 тривалості й правила частково замінить персональна памʼять — поки константи.

export const WORK_START = "07:00";
export const WORK_END = "22:00";
export const BUFFER_MIN = 10; // буфер між справами
export const DEFAULT_DURATION_MIN = 30; // fallback для незнайомої справи

// --- Час: "HH:MM" ↔ хвилини від опівночі ---
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- Дефолтні тривалості: перший збіг виграє, інакше DEFAULT_DURATION_MIN ---
const DURATION_RULES: [RegExp, number][] = [
  [/зарядк|разминк/i, 20],
  [/тренуванн|трениров|спорт|\bзал\b|йог[аи]|пробіжк|пробежк/i, 60],
  [/зйомк|знімат|зняти відео|відеомонтаж|монтаж/i, 90],
  [/сніданок|завтрак/i, 20],
  [/обід|обед/i, 30],
  [/вечер[яю]|ужин/i, 40],
  [/готуват|приготуват|приготовить|готовк|варит/i, 40],
  [/прибиран|прибрат|убор|помити|помыть|пропилосос/i, 45],
  [/прогулянк|погулять|прогулк|вигуляти|вулиц|парк/i, 45],
  [/лікар|врач|поліклін|стоматолог|аналіз|аналог/i, 60],
  [/садок|садик|школ|відвест|отвез|забрат|забрать|заберу/i, 20],
  [/магазин|закуп|продукт|купит|замовит|заказ/i, 30],
  [/подзвонит|зателефон|позвонит|дзвінок|звонок|созвон/i, 15],
  [/робот|работ|зустріч|встреч|мітинг|meeting|нарад/i, 60],
  [/урок|домашк|занят|навчан|вивчит/i, 40],
];

export function durationFor(title: string): number {
  for (const [re, min] of DURATION_RULES) if (re.test(title)) return min;
  return DEFAULT_DURATION_MIN;
}

// --- Хардкод-правила Етапу 1: вікно дозволеного часу для гнучкої справи ---
// null → без обмежень (усе робоче вікно).
const RULE_WINDOWS: [RegExp, string, string][] = [
  [/зарядк|разминк|тренуванн|трениров|пробіжк|пробежк|йог[аи]/i, WORK_START, "12:00"], // зранку
  [/зйомк|знімат|зняти відео|відеомонтаж|монтаж/i, "17:00", WORK_END], // після 17:00
];

export function ruleWindow(title: string): [number, number] | null {
  for (const [re, lo, hi] of RULE_WINDOWS) if (re.test(title)) return [toMin(lo), toMin(hi)];
  return null;
}
