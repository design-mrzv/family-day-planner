"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SolverResult } from "@/lib/solver/types";
import ScheduleView from "./ScheduleView";

type NotifSupport = "checking" | "ios-need-install" | "supported" | "unsupported";
type NotifStatus = "idle" | "enabling" | "enabled" | "error";

// PushManager.subscribe() хоче Uint8Array, VAPID-ключ у env — base64url-рядок.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export default function Planner() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [planDate, setPlanDate] = useState<string | null>(null);
  const [routineHint, setRoutineHint] = useState(false);
  // Для тесту гейту Етапу 2: підставити дату вручну, щоб «прожити» 7 днів за сеанс.
  const [dateOverride, setDateOverride] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [notifSupport, setNotifSupport] = useState<NotifSupport>("checking");
  const [notifStatus, setNotifStatus] = useState<NotifStatus>("idle");
  const [timezoneInput, setTimezoneInput] = useState("");
  const [timezoneSaved, setTimezoneSaved] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [timezoneDetected, setTimezoneDetected] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareGenerating, setShareGenerating] = useState(false);

  // Read-only посилання для партнера (Етап 4). Сирий токен ніде не зберігається —
  // показуємо один раз одразу після генерації, повторно показати неможливо.
  async function onGenerateShareLink() {
    setShareGenerating(true);
    try {
      const res = await fetch("/api/share/token", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.shareUrl as string);
      }
    } finally {
      setShareGenerating(false);
    }
  }

  // iOS Safari підтримує push ТІЛЬКИ для сайтів, доданих на головний екран (iOS 16.4+) —
  // системне обмеження Apple, кодом не обійти. Тому окрема гілка з інструкцією.
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;

      if (isIOS && !isStandalone) {
        if (!cancelled) setNotifSupport("ios-need-install");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setNotifSupport("unsupported");
        return;
      }
      if (!cancelled) setNotifSupport("supported");

      const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
      const sub = await reg?.pushManager.getSubscription().catch(() => undefined);
      if (!cancelled && sub) setNotifStatus("enabled");
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onEnableNotifications() {
    setNotifStatus("enabling");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifStatus("error");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setNotifStatus(res.ok ? "enabled" : "error");
    } catch {
      setNotifStatus("error");
    }
  }

  // Памʼять рутини: підставляє звичні справи + перенесене в поле.
  // force=false (на відкритті) не перезаписує введене; force=true (кнопка) заповнює завжди.
  function loadRoutine(force: boolean) {
    fetch("/api/routine")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.prefill) return;
        setText((cur) => {
          if (!force && cur.trim() !== "") return cur;
          setRoutineHint(true);
          return data.prefill;
        });
      })
      .catch(() => {
        /* мовчки — заготовка не критична */
      });
  }

  useEffect(() => loadRoutine(false), []);

  useEffect(() => {
    fetch("/api/timezone")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.timezone) {
          setTimezoneSaved(data.timezone as string);
          setTimezoneInput(data.timezone as string);
        }
      })
      .catch(() => {
        /* мовчки — поле лишиться порожнім, можна ввести вручну */
      });
  }, []);

  // Пояс, який реально налаштований на пристрої (ОС/браузер) — не геолокація (та дає лише
  // координати, а не IANA-пояс, і легко хибить при VPN/тревелі). Це не вгадування: ми лише
  // читаємо, а не самі вирішуємо — застосовується тільки якщо людина сама натисне кнопку.
  useEffect(() => {
    async function detect() {
      try {
        setTimezoneDetected(Intl.DateTimeFormat().resolvedOptions().timeZone);
      } catch {
        /* невідомо — просто не покажемо підказку */
      }
    }
    void detect();
  }, []);

  // Ранковий сценарій: якщо на сьогодні (за поясом користувача) вже є розклад — показуємо
  // його одразу, без повторного "Розкласти". Заодно підставляємо в поле дати "завтра"
  // за поясом користувача (не дату браузера) — цільова дата для вечірнього вводу.
  useEffect(() => {
    fetch("/api/plan/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.tomorrow) setDateOverride(data.tomorrow as string);
        if (data.result) {
          setResult(data.result as SolverResult);
          setPlanDate(data.date as string);
        }
      })
      .catch(() => {
        /* мовчки — поле дати лишиться з дефолтом браузера, можна ввести вручну */
      });
  }, []);

  async function onSaveTimezone(override?: string) {
    const input = override ?? timezoneInput;
    setTimezoneSaving(true);
    setTimezoneError(null);
    try {
      const res = await fetch("/api/timezone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTimezoneError(data?.message ?? "Не вдалося зберегти пояс.");
        return;
      }
      setTimezoneSaved(data.timezone as string);
      setTimezoneInput(data.timezone as string);
    } catch {
      setTimezoneError("Мережа недоступна. Спробуй ще раз.");
    } finally {
      setTimezoneSaving(false);
    }
  }

  async function onPlan() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const today = dateOverride; // YYYY-MM-DD (за замовчуванням — сьогодні; для тесту редагується)
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
    <main className="stack" style={{ maxWidth: 600 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Family Day Planner</h1>
        <button onClick={onLogout}>Вийти</button>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Сповіщення</span>
          {notifSupport === "supported" && notifStatus !== "enabled" && (
            <button className="btn-primary" onClick={onEnableNotifications} disabled={notifStatus === "enabling"}>
              {notifStatus === "enabling" ? "Вмикаю…" : "Увімкнути сповіщення"}
            </button>
          )}
          {notifStatus === "enabled" && <span className="muted">Увімкнено ✓</span>}
        </div>
        {notifSupport === "ios-need-install" && (
          <p className="muted">Щоб отримувати сповіщення на iPhone: Поділитися (⬆︎) → «На головний екран» → відкрий застосунок звідти.</p>
        )}
        {notifStatus === "error" && <p className="error-text">Не вдалося увімкнути сповіщення. Спробуй ще раз.</p>}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Часовий пояс{timezoneSaved ? ` (зараз: ${timezoneSaved})` : ""}</span>
            <input
              type="text"
              value={timezoneInput}
              onChange={(e) => setTimezoneInput(e.target.value)}
              placeholder="Київ / Chicago / +2"
            />
          </label>
          <button type="button" onClick={() => onSaveTimezone()} disabled={timezoneSaving || timezoneInput.trim() === ""}>
            {timezoneSaving ? "Зберігаю…" : "Зберегти"}
          </button>
        </div>
        {timezoneError && <p className="error-text">{timezoneError}</p>}
        {timezoneDetected && timezoneSaved && timezoneDetected !== timezoneSaved && (
          <p className="muted">
            Пристрій каже, що ти зараз у поясі {timezoneDetected}.{" "}
            <button type="button" onClick={() => onSaveTimezone(timezoneDetected)} disabled={timezoneSaving}>
              Застосувати
            </button>
          </p>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Партнер бачить сьогоднішній план</span>
          <button onClick={onGenerateShareLink} disabled={shareGenerating}>
            {shareGenerating ? "Генерую…" : "Отримати посилання"}
          </button>
        </div>
        {shareUrl && (
          <p className="muted">
            Тільки перегляд, збережи — повторно не покажу: <a href={shareUrl}>{shareUrl}</a>
          </p>
        )}
      </div>

      <div className="stack">
        <p>Напиши справи на завтра, як думаєш — одним текстом.</p>

        {routineHint && <p className="muted">Підставили твої звичні справи — прибери зайве, додай унікальне.</p>}

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRoutineHint(false);
          }}
          rows={6}
          style={{ width: "100%", display: "block" }}
          placeholder="тренування, забрати старшого о 15:00, зняти відео, вечеря, оплатити садок до пʼятниці"
        />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn-primary" onClick={onPlan} disabled={loading || text.trim() === ""}>
            {loading ? "Розкладаю…" : "Розкласти"}
          </button>
          <span className="row">
            <label className="muted row">
              дата (для тесту гейту):{" "}
              <input type="date" value={dateOverride} onChange={(e) => setDateOverride(e.target.value)} />
            </label>
            <button type="button" onClick={() => loadRoutine(true)}>
              ↻ підставити заготовку з памʼяті
            </button>
          </span>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && <ScheduleView result={result} onMoveToTomorrow={onMoveToTomorrow} onDurationSaved={onPlan} />}
    </main>
  );
}
