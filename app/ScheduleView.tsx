import { isEmptyResult, type SolverResult } from "@/lib/solver/types";
import DurationEditor from "./DurationEditor";

// Презентаційний компонент — та сама розмітка для авторизованого Planner.tsx
// (readOnly=false) і публічної read-only сторінки для партнера (app/share/[token]/page.tsx,
// readOnly=true). У readOnly-режимі DurationEditor і "→ завтра" не рендеряться —
// жорстка межа з PRODUCT_SPEC_v2 розділ 4 крок 6: партнер тільки дивиться.
export default function ScheduleView({
  result,
  readOnly = false,
  onMoveToTomorrow,
  onDurationSaved,
}: {
  result: SolverResult;
  readOnly?: boolean;
  onMoveToTomorrow?: (title: string) => void;
  onDurationSaved?: () => void;
}) {
  if (isEmptyResult(result)) {
    return (
      <p style={{ marginTop: 16 }}>
        Здається, тут немає конкретних справ. Спробуй написати, що плануєш зробити завтра.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 16, maxWidth: 600 }}>
      <h2>Розклад</h2>
      {result.schedule.filter((s) => s.status !== "moved").length === 0 ? (
        <p>Порожньо.</p>
      ) : (
        <ul>
          {result.schedule
            .filter((s) => s.status !== "moved")
            .map((s) => (
              <li key={`${s.start}-${s.title}`}>
                <b>{s.start}</b> — {s.title}
                {!readOnly && (
                  <DurationEditor key={s.duration_min} title={s.title} durationMin={s.duration_min} onSaved={onDurationSaved ?? (() => {})} />
                )}{" "}
                {s.type === "fixed" ? "[фіксовано]" : ""}
                {!readOnly && (
                  <button onClick={() => onMoveToTomorrow?.(s.title)} style={{ marginLeft: 8 }}>
                    → завтра
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}

      {result.overflow.length > 0 && (
        <>
          <h2>Не влізло сьогодні</h2>
          <ul>
            {result.overflow.map((o) => (
              <li key={`${o.title}-${o.reason}`}>
                {o.title}
                {!readOnly && (
                  <DurationEditor key={o.duration_min} title={o.title} durationMin={o.duration_min} onSaved={onDurationSaved ?? (() => {})} />
                )}{" "}
                — {o.reason === "conflict" ? "конфлікт часу" : "немає місця"}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.deadlines.length > 0 && (
        <>
          <h2>Дедлайни</h2>
          <ul>
            {result.deadlines.map((d, i) => (
              <li key={i}>
                {d.title} — до {d.date}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
