import { isEmptyResult, type SolverResult, type Scheduled } from "@/lib/solver/types";
import DurationEditor from "./DurationEditor";

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const PX_PER_MIN = 1.2; // 72px/год
const MIN_BLOCK_HEIGHT = 48; // достатньо для двох компактних рядків (назва + час), а не рівно duration_min

// Timeline: година зліва (сітка + мітки), блоки задач позиціоновані й висотою
// пропорційні реальному часу/тривалості. Діапазон — НЕ фіксовані 24 год (порожньо й
// довгий скрол на телефоні), а компактний: від першої задачі (і "зараз", якщо isToday)
// до останньої (і "зараз"), з годинним запасом по краях.
function Timeline({
  items,
  readOnly,
  onToggleDone,
  onOpenDetail,
  isToday,
}: {
  items: Scheduled[];
  readOnly: boolean;
  onToggleDone?: (title: string, done: boolean) => void;
  onOpenDetail?: (s: Scheduled) => void;
  isToday: boolean;
}) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const starts = items.map((s) => timeToMinutes(s.start));
  const ends = items.map((s) => timeToMinutes(s.start) + s.duration_min);
  const lowCandidates = isToday ? [...starts, nowMinutes] : starts;
  const highCandidates = isToday ? [...ends, nowMinutes] : ends;

  let rangeStart = Math.floor((Math.min(...lowCandidates) - 60) / 60) * 60;
  let rangeEnd = Math.ceil((Math.max(...highCandidates) + 60) / 60) * 60;
  rangeStart = Math.max(0, rangeStart);
  rangeEnd = Math.min(24 * 60, rangeEnd);

  const hours: number[] = [];
  for (let t = rangeStart; t <= rangeEnd; t += 60) hours.push(t);

  const totalHeight = (rangeEnd - rangeStart) * PX_PER_MIN;
  const showNowLine = isToday && nowMinutes >= rangeStart && nowMinutes <= rangeEnd;

  return (
    <div className="timeline" style={{ height: totalHeight }}>
      {hours.map((t) => (
        <div key={t} className="timeline-hour" style={{ top: (t - rangeStart) * PX_PER_MIN }}>
          <span className="timeline-hour-label">{minutesToLabel(t)}</span>
          <span className="timeline-hour-line" />
        </div>
      ))}

      {showNowLine && (
        <div className="now-line" style={{ top: (nowMinutes - rangeStart) * PX_PER_MIN }}>
          <span className="now-dot" />
        </div>
      )}

      {items.map((s, i) => {
        const top = (timeToMinutes(s.start) - rangeStart) * PX_PER_MIN;
        // items відсортовані за start (solver/reschedule це гарантують) — наступний елемент
        // визначає межу, за яку MIN_BLOCK_HEIGHT не може заходити (інакше візуально наліз би
        // на сусідній блок при щільному, але легальному розкладі — буфер лише 10-15 хв).
        const nextTop = i + 1 < items.length ? (timeToMinutes(items[i + 1].start) - rangeStart) * PX_PER_MIN : totalHeight;
        const height = Math.min(Math.max(s.duration_min * PX_PER_MIN, MIN_BLOCK_HEIGHT), Math.max(nextTop - top, s.duration_min * PX_PER_MIN));
        const done = s.status === "done";
        const clickable = !readOnly && onOpenDetail;
        return (
          <div
            key={`${s.start}-${s.title}`}
            className="timeline-block card"
            style={{ top, height, opacity: done ? 0.6 : 1, cursor: clickable ? "pointer" : undefined }}
            onClick={clickable ? () => onOpenDetail(s) : undefined}
          >
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start", height: "100%" }}>
              <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    textDecoration: done ? "line-through" : "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.title}
                  {s.type === "fixed" && <span className="badge">фіксовано</span>}
                </span>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  {s.start}–{minutesToLabel(timeToMinutes(s.start) + s.duration_min)}
                </span>
              </span>
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleDone?.(s.title, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={done ? "Позначити невиконаним" : "Позначити виконаним"}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Презентаційний компонент — та сама розмітка для авторизованого Planner.tsx
// (readOnly=false) і публічної read-only сторінки для партнера (app/share/[token]/page.tsx,
// readOnly=true). У readOnly-режимі чекбокс і тап-у-деталі не рендеряться — жорстка
// межа з PRODUCT_SPEC_v2 розділ 4 крок 6: партнер тільки дивиться.
export default function ScheduleView({
  result,
  readOnly = false,
  isToday = false,
  onDurationSaved,
  onToggleDone,
  onOpenDetail,
}: {
  result: SolverResult;
  readOnly?: boolean;
  isToday?: boolean;
  onDurationSaved?: () => void;
  onToggleDone?: (title: string, done: boolean) => void;
  onOpenDetail?: (s: Scheduled) => void;
}) {
  if (isEmptyResult(result)) {
    return (
      <p className="muted" style={{ marginTop: 16 }}>
        Здається, тут немає конкретних справ. Спробуй написати, що плануєш зробити завтра.
      </p>
    );
  }

  const visible = result.schedule.filter((s) => s.status !== "moved");

  return (
    <div className="stack" style={{ marginTop: 16, maxWidth: 600 }}>
      <div>
        <h2>Розклад</h2>
        {visible.length === 0 ? (
          <p className="muted">Порожньо.</p>
        ) : (
          <Timeline
            items={visible}
            readOnly={readOnly}
            onToggleDone={onToggleDone}
            onOpenDetail={onOpenDetail}
            isToday={isToday}
          />
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
