"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Помилка.");
        return;
      }
      setDevLink(data.devLink as string);
    } catch {
      setError("Мережа недоступна. Спробуй ще раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="stack"
      style={{ maxWidth: 600, minHeight: "calc(100dvh - 32px)", justifyContent: "center" }}
    >
      <h1>Family Day Planner</h1>
      <p className="muted">Введи email — надішлемо посилання для входу.</p>

      <form onSubmit={onSubmit} className="stack" style={{ gap: 16 }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mama@example.com"
          style={{ width: "100%" }}
        />
        <button type="submit" className="btn-primary" disabled={loading || email.trim() === ""}>
          {loading ? "Надсилаю…" : "Отримати посилання"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {devLink && (
        <p className="muted">
          Ще нема відправки листів (dev-режим) — перейди за посиланням, щоб увійти:
          <br />
          <a href={devLink}>{devLink}</a>
        </p>
      )}
    </main>
  );
}
