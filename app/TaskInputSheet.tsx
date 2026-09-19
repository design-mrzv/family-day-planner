"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

// Модалка вводу — той самий textarea+"Розкласти", що раніше жив прямо на сторінці,
// винесений за FAB (Planner.tsx), щоб головний екран лишався розкладом, не формою.
// Звичні задачі (routineItems) — чіпи-чекбокси, не підставлений у текст рядок (Етап 5,
// раунд 4): тап перемикає, textarea лишається чистою для нового/унікального.
export default function TaskInputSheet({
  open,
  onClose,
  text,
  setText,
  onPlan,
  loading,
  error,
  routineItems,
  selected,
  onToggleItem,
  hasResult,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  setText: (v: string) => void;
  onPlan: () => Promise<boolean>;
  loading: boolean;
  error: string | null;
  routineItems: string[];
  selected: Set<string>;
  onToggleItem: (title: string) => void;
  hasResult: boolean;
}) {
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

  const hasChosen = routineItems.some((t) => selected.has(t));
  const canSubmit = hasChosen || text.trim() !== "";

  async function handlePlan() {
    const ok = await onPlan();
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel stack" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "flex-start" }}>
          <p style={{ flex: 1, minWidth: 0 }}>{hasResult ? "На завтра" : "Напиши справи на завтра, як думаєш — одним текстом."}</p>
          <button onClick={onClose} aria-label="Закрити" className="icon-btn" style={{ flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {routineItems.length > 0 && (
          <div className="row" style={{ flexWrap: "wrap" }}>
            {routineItems.map((title) => (
              <button
                key={title}
                type="button"
                className="chip"
                aria-pressed={selected.has(title)}
                onClick={() => onToggleItem(title)}
              >
                {title}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={routineItems.length > 0 ? 3 : 6}
          autoFocus={routineItems.length === 0}
          style={{ width: "100%", display: "block" }}
          placeholder={routineItems.length > 0 ? "щось нове, чого нема вище" : "тренування, забрати старшого о 15:00, зняти відео, вечеря, оплатити садок до пʼятниці"}
        />
        <button className="btn-primary" onClick={handlePlan} disabled={loading || !canSubmit}>
          {loading ? "Розкладаю…" : "Розкласти план"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
