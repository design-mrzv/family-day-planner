import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "./session";

// Серверний хелпер: читає cookie сесії, перевіряє підпис. Тільки для Server Components/routes.
export async function getSession(): Promise<{ userId: string } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
