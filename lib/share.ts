import { createHash } from "crypto";

// SHA-256 хеш read-only посилання для партнера. Спільна функція для генерації
// (POST /api/share/token) і резолюції (app/share/[token]/page.tsx) — один
// алгоритм в одному місці. Зберігаємо тільки хеш, ніколи сирий токен.
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
