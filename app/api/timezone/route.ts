import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { resolveTimezone } from "@/lib/timezone";

export const runtime = "nodejs";

// Поточний пояс користувача — для поля налаштувань у Planner.tsx.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }
  const [row] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.userId)).limit(1);
  return Response.json({ timezone: row?.timezone ?? null });
}

const BodySchema = z.strictObject({ input: z.string().trim().min(1) });

// Заміна команди /timezone з Telegram-бота. Той самий принцип "не вгадувати" —
// resolveTimezone повертає null на незнайоме місто, і ми чесно кажемо про це,
// а не мовчки підставляємо щось приблизне.
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
    return Response.json({ error: "bad_request", message: "Поле input обовʼязкове." }, { status: 400 });
  }

  const timezone = resolveTimezone(parsed.data.input);
  if (!timezone) {
    return Response.json(
      { error: "not_resolved", message: "Не впізнала пояс. Спробуй назву великого міста або +N/-N від UTC." },
      { status: 400 },
    );
  }

  await db.update(users).set({ timezone }).where(eq(users.id, session.userId));
  return Response.json({ timezone });
}
