import { normalizeTaskKey } from "./solver/config";

// Один збережений день: дата + вивід solver-а (звідки беремо назви справ).
export interface PlanRow {
  date: string;
  tasks: { schedule?: { title: string }[]; overflow?: { title: string }[] } | unknown;
}

// Рутина: назви справ, що зустрічались у ≥ threshold різних днів за наданий період.
// Детерміновано, без LLM. Дедлайни навмисно не рахуємо — вони одноразові, не рутина.
// Повертає рядок для підстановки в textarea (назви через кому, найчастіші першими).
export function computeRoutine(plans: PlanRow[], threshold = 2): string {
  const stat = new Map<string, { count: number; lastTitle: string; lastDate: string }>();

  for (const plan of plans) {
    const t = plan.tasks as { schedule?: { title: string }[]; overflow?: { title: string }[] };
    const titles = [...(t?.schedule ?? []), ...(t?.overflow ?? [])].map((x) => x.title);

    // У межах одного дня рахуємо назву один раз (Set по нормалізованому ключу).
    const seenToday = new Set<string>();
    for (const title of titles) {
      const key = normalizeTaskKey(title);
      if (seenToday.has(key)) continue;
      seenToday.add(key);

      const prev = stat.get(key);
      if (!prev) {
        stat.set(key, { count: 1, lastTitle: title, lastDate: plan.date });
      } else {
        prev.count += 1;
        if (plan.date >= prev.lastDate) {
          prev.lastTitle = title;
          prev.lastDate = plan.date;
        }
      }
    }
  }

  return [...stat.values()]
    .filter((s) => s.count >= threshold)
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1))
    .map((s) => s.lastTitle)
    .join(", ");
}

// Унікальні назви одного дня (schedule+overflow) у порядку появи, дедуп по ключу.
function uniqueTitles(plan: PlanRow): string[] {
  const t = plan.tasks as { schedule?: { title: string }[]; overflow?: { title: string }[] };
  const titles = [...(t?.schedule ?? []), ...(t?.overflow ?? [])].map((x) => x.title);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const title of titles) {
    const key = normalizeTaskKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

// Заготовка на завтра: усе незакрите з останнього дня (падає мовчки, крок 4 спеку)
// + рутинні справи, обʼєднані з дедуплікацією за назвою. plans — від найновішого.
export function computePrefill(plans: PlanRow[], threshold = 2): string {
  if (plans.length === 0) return "";

  const carry = uniqueTitles(plans[0]); // найсвіжіший день першим
  const routine = computeRoutine(plans, threshold);
  const routineTitles = routine ? routine.split(", ") : [];

  const seen = new Set(carry.map(normalizeTaskKey));
  const merged = [...carry];
  for (const title of routineTitles) {
    const key = normalizeTaskKey(title);
    if (seen.has(key)) continue; // уже є серед перенесених — не дублюємо
    seen.add(key);
    merged.push(title);
  }
  return merged.join(", ");
}
