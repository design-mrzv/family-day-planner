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
    <main>
      <h1>Family Day Planner</h1>
      <p>Введи email — надішлемо посилання для входу.</p>

      <form onSubmit={onSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mama@example.com"
          style={{ display: "block", width: "100%", maxWidth: 320, fontFamily: "inherit" }}
        />
        <button type="submit" disabled={loading || email.trim() === ""} style={{ marginTop: 8 }}>
          {loading ? "Надсилаю…" : "Отримати посилання"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {devLink && (
        <p style={{ marginTop: 16 }}>
          Ще нема відправки листів (dev-режим) — перейди за посиланням, щоб увійти:
          <br />
          <a href={devLink}>{devLink}</a>
        </p>
      )}
    </main>
  );
}
