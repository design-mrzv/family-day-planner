"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Gear, X, Plus, BellSimple, ShareNetwork, SignOut, Clock, CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { SolverResult, Scheduled } from "@/lib/solver/types";
import { normalizeTaskKey } from "@/lib/solver/config";
import ScheduleView, { formatHeaderDate } from "./ScheduleView";
import TaskInputSheet from "./TaskInputSheet";
import TaskDetailSheet from "./TaskDetailSheet";

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
  // Вечірній prefill (Етап 5, раунд 4): звичні задачі — чіпи-чекбокси, не суцільний текст
  // для ручного редагування. text лишається чистим полем для нового/унікального.
  const [routineItems, setRoutineItems] = useState<string[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<Set<string>>(new Set());
  const [colorOverrides, setColorOverrides] = useState<Map<string, number>>(new Map());
  // Дата, на яку реально плануємо — заповнюється автоматично з /api/plan/today.tomorrow
  // (пояс користувача), без ручного поля в UI (гейти пройдено, дебаг-поле більше не потрібне).
  const [targetDate, setTargetDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  // Сьогодні за поясом користувача (з /api/plan/today.date) — для FAB "Сьогодні"
  // (onAddToday) і для заголовка сторінки. Стартове значення — дата браузера, щоб
  // заголовок не блимав порожнім; уточнюється поясом користувача одразу після монтування.
  const [todayDate, setTodayDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Scheduled | null>(null);
  // Попап "не вистачило місця" — коли конфлікт вирішується переносом, а для зсунутої
  // задачі так і не знайшлося вільного часу, вона мовчки падає в overflow. Без цього
  // попапу підтвердження "перенести" виглядало б успішним, хоча задача випала з дня.
  const [displacedNotice, setDisplacedNotice] = useState<string[] | null>(null);
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

  // Памʼять рутини: звичні справи + перенесене з учора — чіпи, обрані за замовчуванням.
  useEffect(() => {
    fetch("/api/routine")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const items = (data?.items as string[] | undefined) ?? [];
        if (items.length === 0) return;
        setRoutineItems(items);
        setSelectedRoutine(new Set(items));
      })
      .catch(() => {
        /* мовчки — заготовка не критична */
      });
  }, []);

  // Кольори задач, які людина сама закріпила (Етап 5, раунд 4) — override над авто-хешем.
  useEffect(() => {
    fetch("/api/task-color")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.colors) return;
        setColorOverrides(new Map(Object.entries(data.colors as Record<string, number>)));
      })
      .catch(() => {
        /* мовчки — картки лишаться на авто-хеші */
      });
  }, []);

  function onToggleRoutineItem(title: string) {
    setSelectedRoutine((cur) => {
      const next = new Set(cur);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function onToggleAllRoutine(selectAll: boolean) {
    setSelectedRoutine(selectAll ? new Set(routineItems) : new Set());
  }

  // Прибрати назву з пропозицій "Рутинні задачі" назавжди (Етап 5, раунд 8) —
  // персистентно на бекенді (ignoredRoutines), оптимістично прибирає і з
  // routineItems, і з selectedRoutine, щоб UI оновився одразу без перезапиту.
  async function onIgnoreRoutineItem(title: string) {
    const res = await fetch("/api/routine/ignore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    setRoutineItems((cur) => cur.filter((t) => t !== title));
    setSelectedRoutine((cur) => {
      const next = new Set(cur);
      next.delete(title);
      return next;
    });
  }

  function onColorSaved(title: string, colorIndex: number) {
    setColorOverrides((cur) => {
      const next = new Map(cur);
      next.set(normalizeTaskKey(title), colorIndex);
      return next;
    });
  }

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
        if (data.date) setTodayDate(data.date as string);
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

  // "Завтра" — повний план з нуля, якщо на targetDate ще нема рядка, інакше
  // домержовує нову задачу в існуючий (Етап 5, раунд 9 — той самий підхід, що
  // onAddToday/api/plan/add-today). resolveConflict:true — другий виклик після
  // підтвердження банера конфлікту.
  async function onPlan(resolveConflict?: boolean): Promise<{ ok: boolean; message?: string; conflicts?: { newTitle: string; withTitle: string; withStart: string }[] }> {
    setLoading(true);
    setError(null);
    try {
      const today = targetDate; // YYYY-MM-DD
      const chosen = routineItems.filter((t) => selectedRoutine.has(t));
      const combinedText = [...chosen, text.trim()].filter((s) => s !== "").join(", ");
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: combinedText, today, resolve_conflict: resolveConflict || undefined }),
      });
      const data = await res.json();
      if (res.status === 409) {
        return { ok: false, conflicts: data.conflicts };
      }
      if (!res.ok) {
        setError(data?.message ?? "Помилка.");
        return { ok: false, message: data?.message ?? "Помилка." };
      }
      setPlanDate(today);
      setResult(data as SolverResult);
      setViewingToday(false); // onPlan() завжди планує на targetDate (завтра), не сьогодні
      if (data.displaced?.length) setDisplacedNotice(data.displaced as string[]);
      return { ok: true };
    } catch {
      setError("Мережа недоступна. Спробуй ще раз.");
      return { ok: false, message: "Мережа недоступна. Спробуй ще раз." };
    } finally {
      setLoading(false);
    }
  }

  // FAB "Сьогодні" — додає нову(і) задачу(і) в УЖЕ ІСНУЮЧИЙ розклад дня, не переписує
  // його (на відміну від onPlan/api/plan). resolveConflict:true — другий виклик після
  // підтвердження банера конфлікту (api/plan/add-today).
  async function onAddToday(text: string, resolveConflict?: boolean): Promise<{ ok: boolean; message?: string; conflicts?: { newTitle: string; withTitle: string; withStart: string }[] }> {
    try {
      const res = await fetch("/api/plan/add-today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, resolve_conflict: resolveConflict || undefined }),
      });
      const data = await res.json();
      if (res.status === 409) {
        return { ok: false, conflicts: data.conflicts };
      }
      if (!res.ok) {
        return { ok: false, message: data?.message ?? "Помилка." };
      }
      setResult(data as SolverResult);
      if (todayDate) setPlanDate(todayDate);
      setViewingToday(true);
      if (data.displaced?.length) setDisplacedNotice(data.displaced as string[]);
      return { ok: true };
    } catch {
      return { ok: false, message: "Мережа недоступна. Спробуй ще раз." };
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

  // "Перенести → сьогодні (вільний час)" з екрана деталей — findFreeSlot на бекенді,
  // без прив'язки до конфлікту (той самий роут, що й для конфліктів минулого раунду).
  async function onMoveToFreeSlotToday(title: string): Promise<{ ok: boolean; message?: string }> {
    if (!planDate) return { ok: false, message: "Немає активного дня." };
    const res = await fetch("/api/plan/move-to-free-slot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: planDate, title }),
    });
    if (res.ok) {
      setResult((await res.json()) as SolverResult);
      return { ok: true };
    }
    const data = await res.json().catch(() => null);
    return { ok: false, message: data?.message ?? "Не вдалося перенести." };
  }

  // Чекбокс "виконано" — на відміну від "→ завтра", не ховає пункт, лише позначає.
  async function onToggleDone(title: string, done: boolean) {
    if (!planDate) return;
    const res = await fetch("/api/plan/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: planDate, title, done }),
    });
    if (res.ok) setResult((await res.json()) as SolverResult);
  }

  const scheduleView = result && planDate && (
    <ScheduleView
      result={result}
      date={planDate}
      onDurationSaved={onPlan}
      onToggleDone={onToggleDone}
      onOpenDetail={setDetailTask}
      isToday={viewingToday}
      colorOverrides={colorOverrides}
      onMoveToFreeSlotToday={onMoveToFreeSlotToday}
      showDate={false}
    />
  );

  return (
    <main className="stack" style={{ maxWidth: 600, paddingBottom: 96 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{formatHeaderDate(planDate ?? todayDate)}</h1>
        <div className="row">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={settingsOpen ? "Закрити налаштування" : "Налаштування"}
            title={settingsOpen ? "Закрити налаштування" : "Налаштування"}
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

          {notifStatus === "enabled" ? (
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="row">
                  <span className="icon-chip">
                    <BellSimple size={16} />
                  </span>
                  Сповіщення
                </span>
                <span className="muted">Увімкнено ✓</span>
              </div>
            </div>
          ) : (
            <details className="card">
              <summary className="settings-row row" style={{ justifyContent: "space-between" }}>
                <span className="row">
                  <span className="icon-chip">
                    <BellSimple size={16} />
                  </span>
                  Сповіщення
                </span>
                <span className="row">
                  <span className="muted">Не увімкнено</span>
                  <CaretRight size={14} className="chevron" />
                </span>
              </summary>
              <div className="stack" style={{ marginTop: 12 }}>
                {notifSupport === "ios-need-install" && (
                  <p className="muted">Щоб отримувати сповіщення на iPhone: Поділитися (⬆︎) → «На головний екран» → відкрий застосунок звідти.</p>
                )}
                {notifStatus === "error" && <p className="error-text">Не вдалося увімкнути сповіщення. Спробуй ще раз.</p>}
                {notifSupport === "supported" && (
                  <button className="btn-primary" onClick={onEnableNotifications} disabled={notifStatus === "enabling"}>
                    {notifStatus === "enabling" ? "Вмикаю…" : "Увімкнути"}
                  </button>
                )}
                {notifSupport !== "supported" && notifSupport !== "ios-need-install" && (
                  <span className="muted">Недоступно на цьому пристрої</span>
                )}
              </div>
            </details>
          )}

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
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <input
                  type="text"
                  value={timezoneInput}
                  onChange={(e) => setTimezoneInput(e.target.value)}
                  placeholder="Київ / Chicago / +2"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  onClick={() => onSaveTimezone()}
                  disabled={timezoneSaving || timezoneInput.trim() === ""}
                  style={{ flexShrink: 0 }}
                >
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
            <summary className="settings-row row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "center" }}>
              <span className="row" style={{ flex: 1, minWidth: 0, flexWrap: "nowrap" }}>
                <span className="icon-chip" style={{ flexShrink: 0 }}>
                  <ShareNetwork size={16} />
                </span>
                <span style={{ minWidth: 0 }}>Поділитись планом з партнером</span>
              </span>
              <CaretRight size={14} className="chevron" style={{ flexShrink: 0 }} />
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <p className="muted">Партнер бачить сьогоднішній план (тільки перегляд).</p>
              <button onClick={onGenerateShareLink} disabled={shareGenerating}>
                {shareGenerating ? "Генерую…" : "Отримати посилання"}
              </button>
              {shareUrl && (
                <p className="muted" style={{ overflowWrap: "anywhere" }}>
                  Збережи — повторно не покажу:{" "}
                  <a href={shareUrl} style={{ overflowWrap: "anywhere" }}>
                    {shareUrl}
                  </a>
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

          <button onClick={() => setInputOpen(true)} aria-label="Написати задачі" title="Написати задачі" className="fab btn-primary">
            <Plus size={24} />
          </button>

          <TaskInputSheet
            open={inputOpen}
            onClose={() => setInputOpen(false)}
            text={text}
            setText={setText}
            onPlan={onPlan}
            onAddToday={onAddToday}
            loading={loading}
            error={error}
            routineItems={routineItems}
            selected={selectedRoutine}
            onToggleItem={onToggleRoutineItem}
            onToggleAllRoutine={onToggleAllRoutine}
            onIgnoreRoutineItem={onIgnoreRoutineItem}
          />

          {detailTask && planDate && (
            <TaskDetailSheet
              key={`${detailTask.title}-${detailTask.start}`}
              task={detailTask}
              date={planDate}
              colorOverrides={colorOverrides}
              onClose={() => setDetailTask(null)}
              onSaved={(r, displaced) => {
                setResult(r);
                setDetailTask(null);
                if (displaced?.length) setDisplacedNotice(displaced);
              }}
              onMoveToTomorrow={async (title) => {
                await onMoveToTomorrow(title);
                setDetailTask(null);
              }}
              onMoveToFreeSlotToday={onMoveToFreeSlotToday}
              onColorSaved={onColorSaved}
            />
          )}

          {displacedNotice && (
            <div className="modal-backdrop" onClick={() => setDisplacedNotice(null)}>
              <div className="modal-panel stack" onClick={(e) => e.stopPropagation()}>
                <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>Не вистачило вільного часу</p>
                <p>
                  {displacedNotice.length === 1
                    ? `«${displacedNotice[0]}» довелось перенести в «Не влізло сьогодні» — вільного часу поруч не знайшлося.`
                    : `Кілька задач довелось перенести в «Не влізло сьогодні» — вільного часу поруч не знайшлося: ${displacedNotice.join(", ")}.`}
                </p>
                <button className="btn-primary" onClick={() => setDisplacedNotice(null)}>
                  Зрозуміло
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
