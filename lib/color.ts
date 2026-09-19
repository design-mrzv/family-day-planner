import { normalizeTaskKey } from "@/lib/solver/config";

// Чисто візуальний колір задачі (Етап 5, раунд 4) — НЕ категоризація. За замовчуванням
// детермінований хеш назви (щоб картки одразу різнились на око), але людина може свідомо
// закріпити свій колір за задачею в TaskDetailSheet — тоді override виграє над хешем.
// Без імпорту lib/db/client — цей файл імпортують клієнтські компоненти
// (ScheduleView/TaskDetailSheet), db-клієнт (потребує POSTGRES_URL) не має тут опинитись.
function hashColorIndex(title: string): number {
  const key = normalizeTaskKey(title);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 6) + 1;
}

// Спільний resolver для ScheduleView (список) і TaskDetailSheet (свотч-вибір) — той самий
// заголовок завжди дає той самий колір, override з БД має пріоритет над авто-хешем.
export function resolveColorIndex(title: string, overrides: Map<string, number>): number {
  return overrides.get(normalizeTaskKey(title)) ?? hashColorIndex(title);
}
