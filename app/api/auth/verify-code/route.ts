import { z } from "zod";
import { verifyLoginCode } from "@/lib/auth/loginCode";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";
import { CODE_LENGTH, MAX_ATTEMPTS } from "@/lib/auth/emailCode";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().email(),
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`)),
});

const MESSAGES: Record<string, string> = {
  not_found: "That code isn't valid. Request a new one.",
  expired: "That code has expired. Request a new one.",
  too_many_attempts: `Too many incorrect attempts. Request a new code.`,
  mismatch: "Incorrect code. Check the digits and try again.",
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "bad_request", message: `Enter the ${CODE_LENGTH}-digit code from the email.` },
      { status: 400 },
    );
  }

  const result = await verifyLoginCode(parsed.data.email, parsed.data.code);

  if (!result.ok) {
    return Response.json(
      {
        error: result.reason,
        message: MESSAGES[result.reason],
        // Скільки спроб лишилось — підказуємо лише на звичайній помилці вводу,
        // щоб людина розуміла, що код скоро згорить.
        ...(result.reason === "mismatch" ? { maxAttempts: MAX_ATTEMPTS } : {}),
      },
      { status: 401 },
    );
  }

  const jwt = await signSession(result.userId);
  const response = Response.json({ ok: true });
  response.headers.append(
    "set-cookie",
    [
      `${SESSION_COOKIE}=${jwt}`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${60 * 60 * 24 * 30}`,
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; "),
  );
  return response;
}
