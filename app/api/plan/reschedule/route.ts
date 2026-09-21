import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/getSession";
import { db } from "@/lib/db/client";
import { dailyPlans } from "@/lib/db/schema";
import { DATE_RE } from "@/lib/parser/schema";
import { normalizeTaskKey, toMin, toHHMM } from "@/lib/solver/config";
import { overlaps, findFreeSlot, type Interval } from "@/lib/solver/solve";
import { saveDurationOverride } from "@/lib/duration";
import type { SolverResult, Scheduled } from "@/lib/solver/types";

export const runtime = "nodejs";

const BodySchema = z.strictObject({
  date: z.string().regex(DATE_RE),
  title: z.string().trim().min(1),
  new_title: z.string().trim().min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  duration_min: z.number().int().min(5).max(480),
  remember_duration_min: z.number().int().min(5).max(480).optional(),
  resolve_conflict: z.boolean().optional(),
});

function end(s: Scheduled): number {
  return toMin(s.start) + s.duration_min;
}

// Ручне редагування часу задачі (Етап 5, екран деталей): та сама схема, що
// app/api/plan/move|complete — знайти за normalizeTaskKey, мутувати на місці, зберегти
// весь tasks-блоб. Конфлікт з іншою задачею дня НЕ зберігається одразу (409 з описом
// конфлікту) — фронтенд перепитує підтвердження, другий виклик з resolve_conflict:true
// зсуває конфліктні задачі на вільний слот (findFreeSlot — той самий пошук, що solver
// сам використовує для гнучких справ, lib/solver/solve.ts) або в overflow, якщо вільного
// місця нема.
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
    return Response.json(
      { error: "bad_request", message: "Потрібні date, title, new_title, start (HH:MM) і duration_min." },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [row] = await db
    .select({ tasks: dailyPlans.tasks })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, data.date)))
    .limit(1);
  if (!row) {
    return Response.json({ error: "not_found", message: "План на цю дату не знайдено." }, { status: 404 });
  }

  const tasks = row.tasks as SolverResult;
  const key = normalizeTaskKey(data.title);
  const target = tasks.schedule.find((s) => normalizeTaskKey(s.title) === key && s.status !== "moved");
  if (!target) {
    return Response.json({ error: "not_found", message: "Задачу не знайдено в розкладі." }, { status: 404 });
  }

  const newStart = toMin(data.start);
  const newEnd = newStart + data.duration_min;

  const conflicts = tasks.schedule.filter(
    (s) => s !== target && s.status !== "moved" && overlaps(newStart, newEnd, toMin(s.start), end(s)),
  );

  if (conflicts.length > 0 && !data.resolve_conflict) {
    return Response.json(
      {
        error: "time_conflict",
        message: "У цей час вже стоїть інша задача.",
        conflicts: conflicts.map((c) => ({ title: c.title, start: c.start, duration_min: c.duration_min })),
      },
      { status: 409 },
    );
  }

  // Конфліктна задача, якій не знайшлось вільного часу, падає в overflow — з погляду
  // solver-а це не помилка, але з погляду людини кнопка "перенести" не мала б виглядати
  // успішною, якщо результат — задача взагалі випала з розкладу дня. displaced іде у
  // відповідь, щоб фронтенд міг показати про це попап.
  const displaced: string[] = [];
  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      const occupied: Interval[] = tasks.schedule
        .filter((s) => s !== target && s !== conflict && s.status !== "moved")
        .map((s) => ({ start: toMin(s.start), end: end(s), buffer: 0 }))
        .concat([{ start: newStart, end: newEnd, buffer: 0 }]);

      const freeStart = findFreeSlot(conflict.duration_min, occupied);
      if (freeStart != null) {
        conflict.start = freeStart;
      } else {
        tasks.schedule = tasks.schedule.filter((s) => s !== conflict);
        tasks.overflow.push({ title: conflict.title, duration_min: conflict.duration_min, reason: "no_slot" });
        displaced.push(conflict.title);
      }
    }
  }

  target.title = data.new_title;
  target.start = toHHMM(newStart);
  target.duration_min = data.duration_min;

  tasks.schedule.sort((a, b) => toMin(a.start) - toMin(b.start));

  await db
    .update(dailyPlans)
    .set({ tasks, updatedAt: new Date() })
    .where(and(eq(dailyPlans.userId, session.userId), eq(dailyPlans.date, data.date)));

  if (data.remember_duration_min != null) {
    await saveDurationOverride(session.userId, data.new_title, data.remember_duration_min).catch(() => {
      /* best effort — не блокує основне збереження */
    });
  }

  return Response.json({ ...tasks, displaced });
}
