"use client";

import { useEffect, useState } from "react";
import { X, CaretRight } from "@phosphor-icons/react/dist/ssr";

type AddConflict = { newTitle: string; withTitle: string; withStart: string };
type AddTodayResult = { ok: boolean; message?: string; conflicts?: AddConflict[] };

// Модалка вводу — той самий textarea+"Розкласти", що раніше жив прямо на сторінці,
// винесений за FAB (Planner.tsx), щоб головний екран лишався розкладом, не формою.
// Звичні задачі (routineItems) — чіпи-чекбокси, не підставлений у текст рядок (Етап 5,
// раунд 4): тап перемикає, textarea лишається чистою для нового/унікального.
// Раунд 6: перемикач "сьогодні/завтра" — сьогодні домержує вже існуючий розклад дня
// (onAddToday), не переписує його; конфлікт фіксованого часу показує inline-банер,
// той самий патерн, що вже є в TaskDetailSheet.
export default function TaskInputSheet({
  open,
  onClose,
  text,
  setText,
  onPlan,
  onAddToday,
  loading,
  error,
  routineItems,
  selected,
  onToggleItem,
  onToggleAllRoutine,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  setText: (v: string) => void;
  onPlan: () => Promise<boolean>;
  onAddToday: (text: string, resolveConflict?: boolean) => Promise<AddTodayResult>;
  loading: boolean;
  error: string | null;
  routineItems: string[];
  selected: Set<string>;
  onToggleItem: (title: string) => void;
  onToggleAllRoutine: (selectAll: boolean) => void;
}) {
  const [target, setTarget] = useState<"today" | "tomorrow">("tomorrow");
  const [addingToday, setAddingToday] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AddConflict | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  function resetAndClose() {
    setTarget("tomorrow");
    setAddError(null);
    setConflict(null);
    setText("");
    onClose();
  }

  const hasChosen = routineItems.some((t) => selected.has(t));
  const canSubmitTomorrow = hasChosen || text.trim() !== "";
  const canSubmitToday = text.trim() !== "";

  async function handlePlan() {
    const ok = await onPlan();
    if (ok) resetAndClose();
  }

  async function handleAddToday(resolveConflict?: boolean) {
    setAddingToday(true);
    setAddError(null);
    const res = await onAddToday(text, resolveConflict);
    setAddingToday(false);
    if (res.ok) {
      resetAndClose();
      return;
    }
    if (res.conflicts && res.conflicts.length > 0) {
      setConflict(res.conflicts[0]);
      return;
    }
    setAddError(res.message ?? "Не вдалося додати.");
  }

  return (
    <div className="modal-backdrop" onClick={resetAndClose}>
      <div className="modal-panel stack" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
          <p style={{ flex: 1, minWidth: 0, fontSize: "1.15rem", fontWeight: 700 }}>Додати задачу</p>
          <button onClick={resetAndClose} aria-label="Закрити" className="icon-btn" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="chip" aria-pressed={target === "today"} onClick={() => setTarget("today")}>
            Сьогодні
          </button>
          <button type="button" className="chip" aria-pressed={target === "tomorrow"} onClick={() => setTarget("tomorrow")}>
            Завтра
          </button>
        </div>

        {target === "tomorrow" && routineItems.length > 0 && (
          <details className="card">
            <summary className="settings-row row" style={{ justifyContent: "space-between" }}>
              <span>Рутинні задачі</span>
              <span className="row">
                <span className="muted">
                  {routineItems.filter((t) => selected.has(t)).length} з {routineItems.length} обрано
                </span>
                <CaretRight size={14} className="chevron" />
              </span>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <label className="row" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={routineItems.every((t) => selected.has(t))}
                  onChange={(e) => onToggleAllRoutine(e.target.checked)}
                />
                <span className="muted">Обрати всі</span>
              </label>
              {routineItems.map((title) => (
                <label key={title} className="row" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(title)} onChange={() => onToggleItem(title)} />
                  {title}
                </label>
              ))}
            </div>
          </details>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={target === "tomorrow" && routineItems.length > 0 ? 3 : 6}
          autoFocus={target === "today" || routineItems.length === 0}
          style={{ width: "100%", display: "block" }}
          placeholder={
            target === "today"
              ? "зателефонувати лікарю, купити молоко о 18:00"
              : routineItems.length > 0
                ? "щось нове, чого нема вище"
                : "тренування, забрати старшого о 15:00, зняти відео, вечеря, оплатити садок до пʼятниці"
          }
        />

        {target === "today" && conflict && (
          <div className="card" style={{ borderColor: "var(--danger)" }}>
            <p>
              У цей час вже стоїть «{conflict.withTitle}» ({conflict.withStart}). Перенести її на вільний час?
            </p>
            <div className="row">
              <button onClick={() => setConflict(null)} disabled={addingToday}>
                Скасувати
              </button>
              <button className="btn-primary" onClick={() => handleAddToday(true)} disabled={addingToday}>
                Перенести і додати
              </button>
            </div>
          </div>
        )}

        {target === "today" ? (
          !conflict && (
            <button className="btn-primary" onClick={() => handleAddToday(false)} disabled={addingToday || !canSubmitToday}>
              {addingToday ? "Додаю…" : "Додати"}
            </button>
          )
        ) : (
          <button className="btn-primary" onClick={handlePlan} disabled={loading || !canSubmitTomorrow}>
            {loading ? "Розкладаю…" : "Розкласти план"}
          </button>
        )}

        {target === "today" ? addError && <p className="error-text">{addError}</p> : error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
