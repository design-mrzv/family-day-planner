import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, pushSubscriptions } from "@/lib/db/schema";
import { sendPush } from "@/lib/push";
import { dateStringInTz, hourInTz } from "@/lib/timezone";

export const runtime = "nodejs";

const EVENING_HOUR = 19;

// Погодинний зовнішній тригер (GitHub Actions, .github/workflows/cron-tick.yml — Vercel
// Hobby дозволяє нативний крон не частіше разу на добу, тож per-user timezone неможливий
// на ньому). Питаємо лише тих, у кого ЗАРАЗ 19:00 за ЇХНІМ поясом, і кому ще не пінгали
// сьогодні (users.lastEveningPingDate) — щоб не заспамити повторним викликом тригера.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const linked = await db
    .selectDistinct({ id: users.id, timezone: users.timezone, lastEveningPingDate: users.lastEveningPingDate })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id));

  let sent = 0;
  for (const user of linked) {
    if (hourInTz(user.timezone) !== EVENING_HOUR) continue;
    const today = dateStringInTz(user.timezone, 0);
    if (user.lastEveningPingDate === today) continue;

    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    let anySent = false;
    for (const sub of subs) {
      try {
        await sendPush(sub, { title: "Family Day Planner", body: "Що плануєш на завтра? Напиши одним текстом у застосунку." });
        anySent = true;
      } catch (e) {
        console.error("evening-ping sendPush failed for", sub.id, e);
      }
    }
    if (anySent) {
      await db.update(users).set({ lastEveningPingDate: today }).where(eq(users.id, user.id));
      sent++;
    }
  }

  return Response.json({ ok: true, sent, total: linked.length });
}
