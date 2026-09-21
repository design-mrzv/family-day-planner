import { z } from "zod";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { ignoredRoutines } from "@/lib/db/schema";
import { normalizeTaskKey } from "@/lib/solver/config";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  title: z.string().trim().min(1),
});

// Прибрати назву з пропозицій "Рутинні задачі" назавжди (Етап 5, раунд 8) —
// не чіпає сам розклад/парсинг, лише lib/routine.ts на етапі підказки
// (app/api/routine/route.ts фільтрує за цією таблицею). Ідемпотентно:
// повторний виклик для тієї самої назви нічого не ламає.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Очікується JSON-тіло." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request", message: "Потрібне поле title." }, { status: 400 });
  }

  const taskKey = normalizeTaskKey(parsed.data.title);
  await db.insert(ignoredRoutines).values({ userId: session.userId, taskKey }).onConflictDoNothing();
  return Response.json({ ok: true });
}
