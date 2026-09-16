"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Gear, X, Plus, BellSimple, ShareNetwork, SignOut, Clock, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { isEmptyResult, type SolverResult } from "@/lib/solver/types";
import ScheduleView from "./ScheduleView";
import TaskInputSheet from "./TaskInputSheet";

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
  // Дата, на яку реально плануємо — заповнюється автоматично з /api/plan/today.tomorrow
  // (пояс користувача), без ручного поля в UI (гейти пройдено, дебаг-поле більше не потрібне).
  const [targetDate, setTargetDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  // "Зараз"-лінія на timeline має сенс лише коли дивимось СЬОГОДНІШНІй план (fetch
  // /api/plan/today), не щойно розкладене "завтра" (onPlan() завжди планує на targetDate).
  const [viewingToday, setViewingToday] = useState(false);
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

  // Памʼять рутини: підставляє звичні справи + перенесене в поле при відкритті,
  // не перезаписує, якщо людина вже щось написала.
  useEffect(() => {
    fetch("/api/routine")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.prefill) return;
        setText((cur) => {
          if (cur.trim() !== "") return cur;
          setRoutineHint(true);
          return data.prefill;
        });
      })
      .catch(() => {
        /* мовчки — заготовка не критична */
      });
  }, []);

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
        if (data.tomorrow) setTargetDate(data.tomorrow as string);
        if (data.result) {
          setResult(data.result as SolverResult);
          setPlanDate(data.date as string);
          setViewingToday(true);
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

  async function onPlan(): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const today = targetDate; // YYYY-MM-DD
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, today }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Помилка.");
        return false;
      }
      setPlanDate(today);
      setResult(data as SolverResult);
      setViewingToday(false); // onPlan() завжди планує на targetDate (завтра), не сьогодні
      return true;
    } catch {
      setError("Мережа недоступна. Спробуй ще раз.");
      return false;
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

  const hasResult = result !== null && !isEmptyResult(result);
  const scheduleView = result && (
    <ScheduleView result={result} onMoveToTomorrow={onMoveToTomorrow} onDurationSaved={onPlan} isToday={viewingToday} />
  );

  return (
    <main className="stack" style={{ maxWidth: 600 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Family Day Planner</h1>
        <div className="row">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={settingsOpen ? "Закрити налаштування" : "Налаштування"}
            aria-expanded={settingsOpen}
            aria-pressed={settingsOpen}
            className={`icon-btn${settingsOpen ? " btn-primary" : ""}`}
          >
            {settingsOpen ? <X size={20} /> : <Gear size={20} />}
          </button>
          <button onClick={onLogout} aria-label="Вийти" title="Вийти" className="icon-btn">
            <SignOut size={20} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="stack">
          <h2>Налаштування</h2>

          <details className="card">
            <summary className="settings-row row" style={{ justifyContent: "space-between" }}>
              <span className="row">
                <span className="icon-chip">
                  <BellSimple size={16} />
                </span>
                Сповіщення
              </span>
              <span className="row">
                <span className="muted">{notifStatus === "enabled" ? "Увімкнено ✓" : "Не увімкнено"}</span>
                <CaretRight size={14} className="chevron" />
              </span>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              {notifSupport === "ios-need-install" && (
                <p className="muted">Щоб отримувати сповіщення на iPhone: Поділитися (⬆︎) → «На головний екран» → відкрий застосунок звідти.</p>
              )}
              {notifStatus === "error" && <p className="error-text">Не вдалося увімкнути сповіщення. Спробуй ще раз.</p>}
              {notifStatus !== "enabled" && notifSupport === "supported" && (
                <button className="btn-primary" onClick={onEnableNotifications} disabled={notifStatus === "enabling"}>
                  {notifStatus === "enabling" ? "Вмикаю…" : "Увімкнути"}
                </button>
              )}
              {notifStatus !== "enabled" && notifSupport !== "supported" && notifSupport !== "ios-need-install" && (
                <span className="muted">Недоступно на цьому пристрої</span>
              )}
            </div>
          </details>

          <details className="card">
            <summary className="settings-row row" style={{ justifyContent: "space-between" }}>
              <span className="row">
                <span className="icon-chip">
                  <Clock size={16} />
                </span>
                Часовий пояс
              </span>
              <span className="row">
                <span className="muted">{timezoneSaved || "Не задано"}</span>
                <CaretRight size={14} className="chevron" />
              </span>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <input
                  type="text"
                  value={timezoneInput}
                  onChange={(e) => setTimezoneInput(e.target.value)}
                  placeholder="Київ / Chicago / +2"
                  style={{ flex: 1 }}
                />
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
            </div>
          </details>

          <details className="card">
            <summary className="settings-row row" style={{ justifyContent: "space-between" }}>
              <span className="row">
                <span className="icon-chip">
                  <ShareNetwork size={16} />
                </span>
                Партнеру
              </span>
              <CaretRight size={14} className="chevron" />
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <p className="muted">Партнер бачить сьогоднішній план (тільки перегляд).</p>
              <button onClick={onGenerateShareLink} disabled={shareGenerating}>
                {shareGenerating ? "Генерую…" : "Отримати посилання"}
              </button>
              {shareUrl && (
                <p className="muted">
                  Збережи — повторно не покажу: <a href={shareUrl}>{shareUrl}</a>
                </p>
              )}
            </div>
          </details>
        </div>
      ) : (
        <>
          {notifSupport === "ios-need-install" && (
            <p className="muted">Щоб отримувати сповіщення на iPhone: Поділитися (⬆︎) → «На головний екран» → відкрий застосунок звідти.</p>
          )}
          {notifSupport === "supported" && notifStatus !== "enabled" && (
            <div className="card row card-accent" style={{ justifyContent: "space-between" }}>
              <span className="row">
                <BellSimple size={20} />
                Увімкни сповіщення, щоб план приходив сам
              </span>
              <button className="btn-primary" onClick={onEnableNotifications} disabled={notifStatus === "enabling"}>
                {notifStatus === "enabling" ? "Вмикаю…" : "Увімкнути"}
              </button>
            </div>
          )}
          {notifStatus === "error" && <p className="error-text">Не вдалося увімкнути сповіщення. Спробуй ще раз.</p>}

          {result === null && <p className="muted">Ще немає розкладу на сьогодні. Натисни +, щоб написати задачі.</p>}
          {scheduleView}

          <button onClick={() => setInputOpen(true)} aria-label="Написати задачі" className="fab btn-primary">
            <Plus size={24} />
          </button>

          <TaskInputSheet
            open={inputOpen}
            onClose={() => setInputOpen(false)}
            text={text}
            setText={setText}
            onPlan={onPlan}
            loading={loading}
            error={error}
            routineHint={routineHint}
            setRoutineHint={setRoutineHint}
            hasResult={hasResult}
          />
        </>
      )}
    </main>
  );
}
