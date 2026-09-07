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
