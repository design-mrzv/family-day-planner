import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { users, dailyPlans, durationOverrides as durationOverridesTable } from "@/lib/db/schema";
import { dateStringInTz, minutesInTz, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { parseTasks, ParseError, ServiceError } from "@/lib/parser/parseTasks";
import { planAndSaveDay } from "@/lib/planDay";
import { placeNewTasks } from "@/lib/solver/addTasks";
import type { DurationOverrides } from "@/lib/solver/solve";
import type { SolverResult } from "@/lib/solver/types";

export const runtime = "nodejs";
// parseTasks обрізає кожен окремий виклик моделі до 10с (CALL_TIMEOUT_MS) і може
// зробити до двох послідовних викликів (основна модель + резервна) — явний ліміт тут,
// щоб функція не впиралась у платформний дефолт раніше, ніж власна логіка встигне
// віддати чесну ServiceError.
export const maxDuration = 30;

const BodySchema = z.strictObject({
  text: z.string().trim().min(1),
  resolve_conflict: z.boolean().optional(),
});

// FAB "Сьогодні" (Етап 5) — додати нову(і) задачу(і) в СЬОГОДНІШНІй день, а не переписати
// його: /api/plan (planAndSaveDay) — повний перезапис з нуля, тут навмисно інакше. Дата —
// тільки серверна (як api/plan/today), клієнт її не передає. minutesInTz(timezone) —
// гнучкі нові задачі не можуть стати раніше за поточний момент дня (інакше "додай на
// сьогодні" о 11:12 могло б поставити задачу на 07:00 — уже минуле).
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
    return Response.json({ error: "bad_request", message: "Поле text обовʼязкове й непорожнє." }, { status: 400 });
  }

  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.userId)).limit(1);
  const timezone = user?.timezone ?? DEFAULT_TIMEZONE;
  const today = dateStringInTz(timezone, 0);

  const [row] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, today)))
    .limit(1);

  try {
    // Нема плану на сьогодні взагалі — немає що домержувати, звичайний перший план дня,
    // але з тим самим обмеженням "не раніше за зараз" (день уже почався).
    if (!row) {
      const result = await planAndSaveDay(session.userId, parsed.data.text, today, minutesInTz(timezone));
      return Response.json(result);
    }

    const llmParsed = await parseTasks(parsed.data.text, today);

    const overrideRows = await db
      .select({ taskKey: durationOverridesTable.taskKey, durationMin: durationOverridesTable.durationMin })
      .from(durationOverridesTable)
      .where(eq(durationOverridesTable.userId, session.userId));
    const overrides: DurationOverrides = new Map(overrideRows.map((r) => [r.taskKey, r.durationMin]));

    const tasks = row.tasks as SolverResult;
    const outcome = placeNewTasks(llmParsed.tasks, tasks, overrides, parsed.data.resolve_conflict ?? false, minutesInTz(timezone));
    if (!outcome.ok) {
      return Response.json({ error: "time_conflict", conflicts: outcome.conflicts }, { status: 409 });
    }

    await db
      .update(dailyPlans)
      .set({ tasks, updatedAt: new Date() })
      .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, today)));

    return Response.json({ ...tasks, displaced: outcome.displaced });
  } catch (e) {
    if (e instanceof ServiceError) {
      return Response.json(
        { error: "service_unavailable", message: "Сервіс тимчасово недоступний. Спробуй за хвилину." },
        { status: 503 },
      );
    }
    if (e instanceof ParseError) {
      return Response.json({ error: "parse_failed", message: "Не вдалося розібрати текст. Спробуй ще раз." }, { status: 502 });
    }
    return Response.json({ error: "internal", message: "Внутрішня помилка." }, { status: 500 });
  }
}
