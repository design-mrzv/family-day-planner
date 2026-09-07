"use client";

import { useState } from "react";

// Просте поле + кнопка (без drag-and-drop). Правка тривалості — це і є памʼять:
// мама один раз поправляє, наступного разу solver підставляє збережене значення.
export default function DurationEditor({
  title,
  durationMin,
  onSaved,
}: {
  title: string;
  durationMin: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(durationMin));
  const [saving, setSaving] = useState(false);

  const changed = value !== "" && Number(value) !== durationMin;

  async function onSave() {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/duration-override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, duration_min: n }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <span style={{ marginLeft: 4 }}>
      (
      <input
        type="number"
        min={5}
        step={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 48, fontFamily: "inherit" }}
      />{" "}
      хв)
      {changed && (
        <button onClick={onSave} disabled={saving} style={{ marginLeft: 4 }}>
          {saving ? "…" : "Запамʼятати"}
        </button>
      )}
    </span>
  );
}
