import { z } from "zod";
import { requestLoginCode } from "@/lib/auth/loginCode";

export const runtime = "nodejs";

const BodySchema = z.strictObject({ email: z.string().trim().toLowerCase().email() });

// За проксі Vercel справжній IP — перший у x-forwarded-for.
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : null;
}

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
      { error: "bad_request", message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await requestLoginCode(parsed.data.email, clientIp(request));
  } catch (err) {
    // Логуємо причину — інакше збій пошти в проді виглядає як німий 502 і не діагностується.
    console.error("[auth] request-code failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "send_failed", message: "Couldn't send the code. Please try again." },
      { status: 502 },
    );
  }

  if (!result.ok) {
    const message =
      result.reason === "cooldown"
        ? `Please wait ${result.retryAfterSec}s before requesting another code.`
        : "Too many requests. Please try again later.";
    return Response.json(
      { error: result.reason, message, retryAfterSec: result.retryAfterSec },
      { status: 429, headers: { "retry-after": String(result.retryAfterSec) } },
    );
  }

  // Відповідь однакова незалежно від того, чи існує акаунт — ендпоінт не має
  // відповідати на питання «ця людина у вас зареєстрована?».
  return Response.json(result);
}
