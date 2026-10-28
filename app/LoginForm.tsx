"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "./Logo";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Код у відповіді приходить лише поза продом (див. lib/auth/loginCode.ts) —
  // щоб розробка не залежала від підтвердженого домену в Resend.
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Something went wrong.");
        if (typeof data?.retryAfterSec === "number") setCooldown(data.retryAfterSec);
        return;
      }
      setStep("code");
      setCode("");
      setCooldown(RESEND_COOLDOWN_SEC);
      if (data.devCode) setDevCode(data.devCode as string);
    } catch {
      setError("Network unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(value: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Something went wrong.");
        setCode("");
        codeInputRef.current?.focus();
        return;
      }
      // Перерендер серверних компонентів — із новою сесійною кукою замість форми
      // входу відрендериться планувальник. URL не змінюється, тому push тут зайвий.
      router.refresh();
    } catch {
      setError("Network unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    // Повний код відправляємо самі — зайвий тап по кнопці тут ні до чого.
    if (digits.length === CODE_LENGTH && !loading) void submitCode(digits);
  }

  return (
    <main
      className="stack"
      style={{ maxWidth: 600, minHeight: "calc(100dvh - 32px)", justifyContent: "center" }}
    >
      <h1>
        <Logo />
      </h1>

      {step === "email" ? (
        <>
          <p className="muted">Enter your email — we&apos;ll send you a sign-in code.</p>
          <form onSubmit={requestCode} className="stack" style={{ gap: 16 }}>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%" }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || email.trim() === ""}
            >
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="muted">
            We sent a {CODE_LENGTH}-digit code to <strong>{email}</strong>.
          </p>
          <div className="stack" style={{ gap: 16 }}>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="000000"
              disabled={loading}
              style={{
                width: "100%",
                fontSize: "1.75rem",
                letterSpacing: "0.3em",
                textAlign: "center",
              }}
            />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setCode("");
                }}
              >
                Use a different email
              </button>
              <button
                type="button"
                className="btn-text"
                onClick={() => void requestCode()}
                disabled={loading || cooldown > 0}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {devCode && (
        <p className="muted">
          Dev mode (no email delivery configured): your code is <strong>{devCode}</strong>
        </p>
      )}
    </main>
  );
}
