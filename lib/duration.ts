import { db } from "@/lib/db/client";
import { durationOverrides } from "@/lib/db/schema";
import { normalizeTaskKey } from "@/lib/solver/config";

// Спільний upsert для "запам'ятати тривалість" — викликається і зі свіжого
// /api/duration-override (DurationEditor), і з /api/plan/reschedule (чекбокс
// "запам'ятати тривалість для схожих задач" в екрані деталей).
export async function saveDurationOverride(userId: string, title: string, durationMin: number): Promise<void> {
  const taskKey = normalizeTaskKey(title);
  await db
    .insert(durationOverrides)
    .values({ userId, taskKey, durationMin })
    .onConflictDoUpdate({
      target: [durationOverrides.userId, durationOverrides.taskKey],
      set: { durationMin, updatedAt: new Date() },
    });
}
