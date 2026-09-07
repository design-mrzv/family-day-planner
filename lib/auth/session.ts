import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";
const SESSION_TTL = "30d";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не налаштований");
  return new TextEncoder().encode(secret);
}

// userId → підписаний JWT (HS256), дійсний 30 днів.
export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

// Перевіряє підпис і термін дії. null — токен відсутній/невалідний/протермінований.
export async function verifySession(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
