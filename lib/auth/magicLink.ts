import { randomBytes, createHash } from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../db/client";
import { users, magicLinks } from "../db/schema";

const LINK_TTL_MIN = 15;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Генерує токен, зберігає лише його хеш. Повертає сирий токен — той, що йде в посилання.
export async function createMagicLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_MIN * 60_000);
  await db.insert(magicLinks).values({ email, tokenHash: hashToken(token), expiresAt });
  return token;
}

// Перевіряє токен (не використаний, не протермінований), позначає використаним,
// повертає (створює за потреби) користувача. null — токен невалідний.
export async function consumeMagicLink(token: string): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token);
  const [link] = await db
    .select()
    .from(magicLinks)
    .where(and(eq(magicLinks.tokenHash, tokenHash), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, new Date())))
    .limit(1);
  if (!link) return null;

  await db.update(magicLinks).set({ usedAt: new Date() }).where(eq(magicLinks.id, link.id));

  const [existing] = await db.select().from(users).where(eq(users.email, link.email)).limit(1);
  if (existing) return { userId: existing.id };

  const [created] = await db.insert(users).values({ email: link.email }).returning();
  return { userId: created.id };
}
