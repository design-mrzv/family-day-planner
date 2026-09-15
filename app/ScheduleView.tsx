import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
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
      <p className="muted" style={{ marginTop: 16 }}>
        Здається, тут немає конкретних справ. Спробуй написати, що плануєш зробити завтра.
      </p>
    );
  }

  return (
    <div className="stack" style={{ marginTop: 16, maxWidth: 600 }}>
      <div>
        <h2>Розклад</h2>
        {result.schedule.filter((s) => s.status !== "moved").length === 0 ? (
          <p className="muted">Порожньо.</p>
        ) : (
          <ul className="list-plain card">
            {result.schedule
              .filter((s) => s.status !== "moved")
              .map((s) => (
                <li key={`${s.start}-${s.title}`}>
                  <span>
                    <b>{s.start}</b> — {s.title}
                    {s.type === "fixed" && <span className="badge">фіксовано</span>}
                  </span>
                  {!readOnly && (
                    <span className="row">
                      <DurationEditor key={s.duration_min} title={s.title} durationMin={s.duration_min} onSaved={onDurationSaved ?? (() => {})} />
                      <button
                        onClick={() => onMoveToTomorrow?.(s.title)}
                        aria-label="Перенести на завтра"
                        title="Перенести на завтра"
                        style={{ display: "flex", alignItems: "center", padding: "6px 8px" }}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>

      {result.overflow.length > 0 && (
        <div>
          <h2>Не влізло сьогодні</h2>
          <ul className="list-plain card">
            {result.overflow.map((o) => (
              <li key={`${o.title}-${o.reason}`}>
                <span>{o.title}</span>
                <span className="row">
                  {!readOnly && (
                    <DurationEditor key={o.duration_min} title={o.title} durationMin={o.duration_min} onSaved={onDurationSaved ?? (() => {})} />
                  )}
                  <span className="muted">{o.reason === "conflict" ? "конфлікт часу" : "немає місця"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.deadlines.length > 0 && (
        <div>
          <h2>Дедлайни</h2>
          <ul className="list-plain card">
            {result.deadlines.map((d, i) => (
              <li key={i}>
                <span>{d.title}</span>
                <span className="muted">до {d.date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
