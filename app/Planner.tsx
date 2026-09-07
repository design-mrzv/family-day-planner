"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SolverResult } from "@/lib/solver/types";
import DurationEditor from "./DurationEditor";

// Парсер не впізнав жодної справи (сміття/емодзі/непов'язані слова) —
// schedule/overflow/deadlines усі порожні одночасно.
function isEmptyResult(r: SolverResult): boolean {
  return r.schedule.length === 0 && r.overflow.length === 0 && r.deadlines.length === 0;
}

export default function Planner() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [planDate, setPlanDate] = useState<string | null>(null);
  const [routineHint, setRoutineHint] = useState(false);

  // Памʼять рутини: на день 2+ підставляємо звичні справи в порожнє поле,
  // щоб мама не писала рутину з нуля. Не перезаписуємо, якщо вона вже щось ввела.
  useEffect(() => {
    let active = true;
    fetch("/api/routine")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.prefill) {
          setText((cur) => {
            if (cur.trim() !== "") return cur;
            setRoutineHint(true);
            return data.prefill;
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function onPlan() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, today }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Помилка.");
        return;
      }
      setPlanDate(today);
      setResult(data as SolverResult);
    } catch {
      setError("Мережа недоступна. Спробуй ще раз.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  // "→ завтра": прибрати справу з сьогодні. Вона повернеться в завтрашній заготовці.
  async function onMoveToTomorrow(title: string) {
    if (!planDate) return;
    const res = await fetch("/api/plan/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: planDate, title }),
    });
    if (res.ok) setResult((await res.json()) as SolverResult);
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Family Day Planner</h1>
        <button onClick={onLogout}>Вийти</button>
      </div>
      <p>Напиши справи на завтра, як думаєш — одним текстом.</p>

      {routineHint && (
        <p style={{ fontSize: "0.85em" }}>
          Підставили твої звичні справи — прибери зайве, додай унікальне.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRoutineHint(false);
        }}
        rows={6}
        style={{ width: "100%", maxWidth: 600, display: "block", fontFamily: "inherit" }}
        placeholder="тренування, забрати старшого о 15:00, зняти відео, вечеря, оплатити садок до пʼятниці"
      />
      <button onClick={onPlan} disabled={loading || text.trim() === ""} style={{ marginTop: 8 }}>
        {loading ? "Розкладаю…" : "Розкласти"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result && isEmptyResult(result) && (
        <p style={{ marginTop: 16 }}>
          Здається, тут немає конкретних справ. Спробуй написати, що плануєш зробити завтра.
        </p>
      )}

      {result && !isEmptyResult(result) && (
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
                    <DurationEditor
                      key={s.duration_min}
                      title={s.title}
                      durationMin={s.duration_min}
                      onSaved={onPlan}
                    />{" "}
                    {s.type === "fixed" ? "[фіксовано]" : ""}
                    <button onClick={() => onMoveToTomorrow(s.title)} style={{ marginLeft: 8 }}>
                      → завтра
                    </button>
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
                    <DurationEditor
                      key={o.duration_min}
                      title={o.title}
                      durationMin={o.duration_min}
                      onSaved={onPlan}
                    />{" "}
                    —{" "}
                    {o.reason === "conflict" ? "конфлікт часу" : "немає місця"}
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
      )}
    </main>
  );
}
