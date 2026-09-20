"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { toMin, toHHMM } from "@/lib/solver/config";
import { resolveColorIndex } from "@/lib/color";
import type { Scheduled, SolverResult } from "@/lib/solver/types";

type Conflict = { title: string; start: string; duration_min: number };

const COLOR_COUNT = 6;

// Екран редагування задачі — відкривається тапом по картці в ScheduleView (Етап 5).
// Тут же: чекбокс "запам'ятати тривалість для схожих задач" (памʼять тривалості,
// той самий механізм, що DurationEditor), ручний вибір кольору (раунд 4 — свідомо
// не авто-категоризація, людина сама закріплює колір), перенесення конфлікту з іншою
// задачею дня на підтвердження (api/plan/reschedule повертає 409 замість тихого
// перезапису) і "Перенести" з вибором сьогодні (вільний слот)/завтра.
// Батько монтує/розмонтовує компонент і задає `key` за назвою+часом задачі — так
// стан полів (title/start/end) щоразу ініціалізується заново з `task` без ефекту,
// що синхронізує пропс у state (react-hooks/set-state-in-effect).
export default function TaskDetailSheet({
  task,
  date,
  colorOverrides,
  onClose,
  onSaved,
  onMoveToTomorrow,
  onMoveToFreeSlotToday,
  onColorSaved,
}: {
  task: Scheduled;
  date: string;
  colorOverrides: Map<string, number>;
  onClose: () => void;
  onSaved: (result: SolverResult) => void;
  onMoveToTomorrow: (title: string) => void;
  onMoveToFreeSlotToday: (title: string) => Promise<{ ok: boolean; message?: string }>;
  onColorSaved: (title: string, colorIndex: number) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [start, setStart] = useState(task.start);
  const [end, setEnd] = useState(() => toHHMM(toMin(task.start) + task.duration_min));
  const [remember, setRemember] = useState(false);
  const [rememberMin, setRememberMin] = useState(String(task.duration_min));
  const [colorIndex, setColorIndex] = useState(() => resolveColorIndex(task.title, colorOverrides));
  const [savingColor, setSavingColor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const durationMin = toMin(end) - toMin(start);
  const invalid = title.trim() === "" || durationMin < 5;

  async function onPickColor(index: number) {
    setColorIndex(index);
    setSavingColor(true);
    try {
      const res = await fetch("/api/task-color", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: task.title, color_index: index }),
      });
      if (res.ok) onColorSaved(task.title, index);
    } finally {
      setSavingColor(false);
    }
  }

  async function submit(resolveConflict: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          title: task.title,
          new_title: title.trim(),
          start,
          duration_min: durationMin,
          remember_duration_min: remember ? Number(rememberMin) : undefined,
          resolve_conflict: resolveConflict || undefined,
        }),
      });
      if (res.status === 409) {
        const data = await res.json();
        setConflict(data.conflicts[0] as Conflict);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не вдалося зберегти.");
        return;
      }
      onSaved((await res.json()) as SolverResult);
    } catch {
      setError("Мережа недоступна. Спробуй ще раз.");
    } finally {
      setSaving(false);
    }
  }

  async function moveToday() {
    setMoving(true);
    setMoveError(null);
    const result = await onMoveToFreeSlotToday(task.title);
    setMoving(false);
    if (result.ok) onClose();
    else setMoveError(result.message ?? "Не вдалося перенести.");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel stack" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
          <p style={{ flex: 1, minWidth: 0, fontSize: "1.15rem", fontWeight: 600 }}>Задача</p>
          <button onClick={onClose} aria-label="Закрити" className="icon-btn" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="field" style={{ maxWidth: "none" }}>
          <span className="field-label">Назва</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div className="row" style={{ justifyContent: "space-between", gap: 32 }}>
          <div className="field" style={{ maxWidth: "none" }}>
            <span className="field-label">Початок</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: "none" }}>
            <span className="field-label">Кінець</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {durationMin < 5 && <p className="error-text">Час завершення має бути пізніше початку.</p>}

        <div className="field" style={{ maxWidth: "none" }}>
          <span className="field-label">Колір</span>
          <div className="row">
            {Array.from({ length: COLOR_COUNT }, (_, i) => i + 1).map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`Колір ${i}`}
                aria-pressed={colorIndex === i}
                onClick={() => onPickColor(i)}
                disabled={savingColor}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  padding: 0,
                  background: `var(--palette-${i})`,
                  border: colorIndex === i ? "2px solid var(--text)" : "2px solid transparent",
                }}
              />
            ))}
          </div>
        </div>

        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Запам&apos;ятати тривалість для схожих задач
        </label>
        {remember && (
          <div className="row">
            <input
              type="number"
              min={5}
              step={5}
              value={rememberMin}
              onChange={(e) => setRememberMin(e.target.value)}
              style={{ width: 72 }}
            />
            <span className="muted">хв</span>
          </div>
        )}

        {conflict && (
          <div className="card" style={{ borderColor: "var(--danger)" }}>
            <p>
              У цей час вже стоїть «{conflict.title}» ({conflict.start}). Перенести її на вільний час?
            </p>
            <div className="row">
              <button onClick={() => setConflict(null)} disabled={saving}>
                Скасувати
              </button>
              <button className="btn-primary" onClick={() => submit(true)} disabled={saving}>
                Перенести і зберегти
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {!conflict && (
          <>
            {!moveMenuOpen ? (
              <button type="button" className="btn-text" onClick={() => setMoveMenuOpen(true)} disabled={saving}>
                Перенести…
              </button>
            ) : (
              <div className="row">
                <button type="button" className="btn-text" onClick={moveToday} disabled={moving}>
                  {moving ? "Переношу…" : "Сьогодні · вільний час"}
                </button>
                <button type="button" className="btn-text" onClick={() => onMoveToTomorrow(task.title)} disabled={moving}>
                  Завтра
                </button>
              </div>
            )}
            {moveError && <p className="error-text">{moveError}</p>}

            <button className="btn-primary btn-lg" onClick={() => submit(false)} disabled={saving || invalid}>
              {saving ? "Зберігаю…" : "Зберегти"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
