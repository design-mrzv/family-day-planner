"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

// Модалка вводу — той самий textarea+"Розкласти", що раніше жив прямо на сторінці,
// винесений за FAB (Planner.tsx), щоб головний екран лишався розкладом, не формою.
export default function TaskInputSheet({
  open,
  onClose,
  text,
  setText,
  onPlan,
  loading,
  error,
  routineHint,
  setRoutineHint,
  hasResult,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  setText: (v: string) => void;
  onPlan: () => Promise<boolean>;
  loading: boolean;
  error: string | null;
  routineHint: boolean;
  setRoutineHint: (v: boolean) => void;
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

        {routineHint && <p className="muted">Підставили твої звичні справи — прибери зайве, додай унікальне.</p>}

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRoutineHint(false);
          }}
          rows={6}
          autoFocus
          style={{ width: "100%", display: "block" }}
          placeholder="тренування, забрати старшого о 15:00, зняти відео, вечеря, оплатити садок до пʼятниці"
        />
        <button className="btn-primary" onClick={handlePlan} disabled={loading || text.trim() === ""}>
          {loading ? "Розкладаю…" : "Розкласти план"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
