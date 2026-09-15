import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashShareToken } from "@/lib/share";

export const runtime = "nodejs";

// Генерує read-only посилання для партнера (Етап 4, PRODUCT_SPEC_v2 розділ 4 крок 6).
// Повторний виклик перезаписує хеш — це і є "перегенерувати": стара версія посилання
// одразу перестає резолвитись. Сирий токен повертається ОДИН раз, ми його не зберігаємо.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const token = randomBytes(24).toString("base64url");
  await db.update(users).set({ shareTokenHash: hashShareToken(token) }).where(eq(users.id, session.userId));

  const origin = new URL(request.url).origin;
  return Response.json({ shareUrl: `${origin}/share/${token}` });
}
