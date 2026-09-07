import { z } from "zod";
import { createMagicLink } from "@/lib/auth/magicLink";

export const runtime = "nodejs";

const BodySchema = z.strictObject({ email: z.string().trim().toLowerCase().email() });

// Поки нема email-сервісу (dev-режим): посилання повертається в відповіді,
// а не шлеться листом. Коли підключимо Resend — тут з'явиться реальна відправка,
// а devLink піде тільки коли NODE_ENV !== "production".
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Очікується JSON-тіло." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "bad_request", message: "Вкажи коректний email." },
      { status: 400 },
    );
  }

  const token = await createMagicLink(parsed.data.email);
  const verifyUrl = new URL("/api/auth/verify", request.url);
  verifyUrl.searchParams.set("token", token);

  return Response.json({ ok: true, devLink: verifyUrl.toString() });
}
