import { and, eq } from "drizzle-orm";
import { ParseError, ServiceError, parseTasks } from "@/lib/parser/parseTasks";
import { DATE_RE } from "@/lib/parser/schema";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans, durationOverrides as durationOverridesTable } from "@/lib/db/schema";
import { planAndSaveDay } from "@/lib/planDay";
import { placeNewTasks } from "@/lib/solver/addTasks";
import type { DurationOverrides } from "@/lib/solver/solve";
import type { SolverResult } from "@/lib/solver/types";

// Ключ Gemini живе тут, на сервері. Node-рантайм (SDK потребує Node, не edge).
export const runtime = "nodejs";

function todayString(): string {
  return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD у локальному часі
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "bad_request", message: "Очікується JSON-тіло." },
      { status: 400 },
    );
  }

  const b = body as { text?: unknown; today?: unknown; resolve_conflict?: unknown } | null;
  const text = b?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return Response.json(
      { error: "bad_request", message: "Поле text обовʼязкове й непорожнє." },
      { status: 400 },
    );
  }
  const today = typeof b?.today === "string" && DATE_RE.test(b.today) ? b.today : todayString();
  const resolveConflict = b?.resolve_conflict === true;

  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized", message: "Потрібно увійти." }, { status: 401 });
  }

  const [row] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, today)))
    .limit(1);

  try {
    // Нема плану на цю дату — звичайний повний план з нуля, як завжди.
    if (!row) {
      const result = await planAndSaveDay(session.userId, text, today);
      return Response.json(result);
    }

    // План на цю дату вже є — домержовуємо нову(і) задачу(і), не переписуємо весь
    // день (Етап 5, раунд 9 — та сама логіка, що FAB "Сьогодні", lib/solver/addTasks.ts).
    // Без minStartMinutes: "завтра" не має обмеження "не раніше за зараз".
    const llmParsed = await parseTasks(text, today);

    const overrideRows = await db
      .select({ taskKey: durationOverridesTable.taskKey, durationMin: durationOverridesTable.durationMin })
      .from(durationOverridesTable)
      .where(eq(durationOverridesTable.userId, session.userId));
    const overrides: DurationOverrides = new Map(overrideRows.map((r) => [r.taskKey, r.durationMin]));

    const tasks = row.tasks as SolverResult;
    const outcome = placeNewTasks(llmParsed.tasks, tasks, overrides, resolveConflict);
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
      return Response.json(
        { error: "parse_failed", message: "Не вдалося розібрати текст. Спробуй ще раз." },
        { status: 502 },
      );
    }
    return Response.json(
      { error: "internal", message: "Внутрішня помилка." },
      { status: 500 },
    );
  }
}
