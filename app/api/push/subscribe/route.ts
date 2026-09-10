import { z } from "zod";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

export const runtime = "nodejs";

// Форма PushSubscription.toJSON() з браузера.
const BodySchema = z.strictObject({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Зберігає підписку браузера на push (Етап 4, заміна Telegram deep-link прив'язки).
// endpoint унікальний глобально — той самий пристрій повторно підписується поверх себе.
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
    return Response.json(
      { error: "bad_request", message: "Некоректна підписка (endpoint/keys.p256dh/keys.auth)." },
      { status: 400 },
    );
  }

  await db
    .insert(pushSubscriptions)
    .values({
      userId: session.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.userId, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
    });

  return Response.json({ ok: true });
}
