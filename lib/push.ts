import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { pushSubscriptions } from "./db/schema";

function configure(): void {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID-ключі не налаштовані");
  webpush.setVapidDetails("mailto:design.mrzv@gmail.com", publicKey, privateKey);
}

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

// Надсилає push одній підписці. 404/410 — підписка більше не існує (юзер вимкнув
// сповіщення в браузері або видалив PWA) — мовчки прибираємо рядок, це не помилка.
export async function sendPush(sub: Subscription, payload: { title: string; body: string }): Promise<void> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      return;
    }
    throw e;
  }
}
