import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, dailyPlans, pushSubscriptions } from "@/lib/db/schema";
import { sendPush } from "@/lib/push";
import { dateStringInTz, hourInTz } from "@/lib/timezone";

export const runtime = "nodejs";

const MORNING_HOUR = 19; // ТИМЧАСОВО для швидкого тесту механізму (норма — 7), повернути назад

// Погодинний зовнішній тригер, той самий принцип, що evening-ping: шлемо лише тим, у
// кого ЗАРАЗ 07:00 за ЇХНІМ поясом. "Сьогодні" теж рахуємо per-user (users.timezone).
// Нема плану на сьогодні → мовчки пропускаємо (retention-етика, без нагадувань-докорів).
// deliveredAt захищає від повторної відправки при повторному тіку в той самий час.
// Тіло push коротке — повний розклад людина бачить у застосунку (GET /api/plan/today).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const linked = await db
    .selectDistinct({ id: users.id, timezone: users.timezone })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id));

  let sent = 0;
  for (const user of linked) {
    if (hourInTz(user.timezone) !== MORNING_HOUR) continue;
    const today = dateStringInTz(user.timezone, 0);
    const [plan] = await db
      .select({ id: dailyPlans.id, deliveredAt: dailyPlans.deliveredAt })
      .from(dailyPlans)
      .where(and(eq(dailyPlans.userId, user.id), eq(dailyPlans.date, today)))
      .limit(1);
    if (!plan || plan.deliveredAt) continue;

    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    let anySent = false;
    for (const sub of subs) {
      try {
        await sendPush(sub, { title: "Доброго ранку!", body: "Твій план на сьогодні готовий 🌅" });
        anySent = true;
      } catch (e) {
        console.error("morning-delivery sendPush failed for", sub.id, e);
      }
    }
    if (anySent) {
      await db.update(dailyPlans).set({ deliveredAt: new Date() }).where(eq(dailyPlans.id, plan.id));
      sent++;
    }
  }

  return Response.json({ ok: true, sent, total: linked.length });
}
