import { Fragment } from "react";
import { isEmptyResult, type SolverResult, type Scheduled } from "@/lib/solver/types";
import { resolveColorIndex } from "@/lib/color";
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

type Row =
  | { kind: "hour"; key: string; label: string }
  | { kind: "now"; key: string }
  | { kind: "task"; key: string; item: Scheduled };

// Еластичний timeline (Етап 5, раунд 3): без пропорційного пікселі-на-хвилину мапінгу —
// звичайний document-flow список у CSS Grid (56px мітка години | контент). Висота кожного
// рядка — його контент, тому навіть 10-15-хвилинні задачі завжди повністю видно, без
// обрізання й без ризику візуально "наїхати" на сусідній блок (проблема попередніх двох
// раундів). Компроміс: більше немає пропорційності "великий проміжок = великий відступ" —
// мітка години зліва лише орієнтир (з'являється при зміні години), не лінійка.
function buildRows(items: Scheduled[], isToday: boolean, nowMinutes: number): Row[] {
  const rows: Row[] = [];
  let lastHour: number | null = null;
  let nowInserted = !isToday;

  for (const item of items) {
    const startMin = timeToMinutes(item.start);
    if (!nowInserted && nowMinutes <= startMin) {
      rows.push({ kind: "now", key: "now" });
      nowInserted = true;
    }
    const hour = Math.floor(startMin / 60);
    if (hour !== lastHour) {
      rows.push({ kind: "hour", key: `hour-${hour}-${item.start}-${item.title}`, label: minutesToLabel(hour * 60) });
      lastHour = hour;
    }
    rows.push({ kind: "task", key: `${item.start}-${item.title}`, item });
  }
  if (!nowInserted) rows.push({ kind: "now", key: "now" });

  return rows;
}

function Timeline({
  items,
  readOnly,
  onToggleDone,
  onOpenDetail,
  isToday,
  colorOverrides,
}: {
  items: Scheduled[];
  readOnly: boolean;
  onToggleDone?: (title: string, done: boolean) => void;
  onOpenDetail?: (s: Scheduled) => void;
  isToday: boolean;
  colorOverrides: Map<string, number>;
}) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const rows = buildRows(items, isToday, nowMinutes);
  const clickable = !readOnly && onOpenDetail;

  return (
    <div className="timeline-grid">
      {rows.map((row) => {
        if (row.kind === "hour") {
          return (
            <Fragment key={row.key}>
              <span className="timeline-hour-label">{row.label}</span>
              <span className="timeline-hour-line" />
            </Fragment>
          );
        }
        if (row.kind === "now") {
          return (
            <Fragment key={row.key}>
              <span />
              <div className="now-row">
                <span className="now-dot" />
                Зараз
                <span style={{ flex: 1, height: 1, background: "var(--accent)" }} />
              </div>
            </Fragment>
          );
        }

        const s = row.item;
        const done = s.status === "done";
        return (
          <Fragment key={row.key}>
            <span />
            <div
              className="timeline-block card"
              style={{
                opacity: done ? 0.6 : 1,
                cursor: clickable ? "pointer" : undefined,
                ["--task-color" as string]: `var(--palette-${resolveColorIndex(s.title, colorOverrides)})`,
              }}
              onClick={clickable ? () => onOpenDetail(s) : undefined}
            >
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
                <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ textDecoration: done ? "line-through" : "none" }}>{s.title}</span>
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
          </Fragment>
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
  colorOverrides = new Map(),
}: {
  result: SolverResult;
  readOnly?: boolean;
  isToday?: boolean;
  onDurationSaved?: () => void;
  onToggleDone?: (title: string, done: boolean) => void;
  onOpenDetail?: (s: Scheduled) => void;
  colorOverrides?: Map<string, number>;
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
            colorOverrides={colorOverrides}
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
