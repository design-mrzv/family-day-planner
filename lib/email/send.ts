import { Resend } from "resend";

// Єдине місце, звідки йдуть листи. Провайдер схований за цією функцією — переїзд
// на Postmark/SES (якщо погіршиться доставляльність) буде правкою одного файлу.
//
// EMAIL_FROM має бути адресою на ВЛАСНОМУ домені, підтвердженому в Resend (SPF+DKIM+DMARC).
// Поки домен не підтверджено, Resend дозволяє слати лише на адресу власника акаунта —
// для локальної розробки цього досить, для реальних користувачів ні.
const FROM = process.env.EMAIL_FROM ?? "Loopin <onboarding@resend.dev>";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY не налаштований");
  return new Resend(key);
}

// Текстова версія обовʼязкова: без неї частина фільтрів ріже лист як підозрілий,
// а код має лишатись читабельним у клієнтах, що не показують HTML.
function codeEmail(code: string, ttlMin: number) {
  const text = [
    `Your Loopin sign-in code: ${code}`,
    "",
    `The code expires in ${ttlMin} minutes.`,
    "If you didn't request it, you can ignore this email.",
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;line-height:1.5">
  <p style="margin:0 0 24px">Your Loopin sign-in code:</p>
  <p style="margin:0 0 24px;font-size:32px;font-weight:600;letter-spacing:0.12em">${code}</p>
  <p style="margin:0 0 8px;color:#6b6560;font-size:14px">The code expires in ${ttlMin} minutes.</p>
  <p style="margin:0;color:#6b6560;font-size:14px">If you didn't request it, you can ignore this email.</p>
</div>`.trim();

  return { text, html };
}

export async function sendLoginCode(to: string, code: string, ttlMin: number): Promise<void> {
  const { text, html } = codeEmail(code, ttlMin);
  const { error } = await client().emails.send({
    from: FROM,
    to,
    subject: `${code} — your Loopin sign-in code`,
    text,
    html,
  });
  // Resend повертає помилку в полі, а не кидає — інакше збій відправки лишився б непоміченим.
  if (error) throw new Error(`Resend: ${error.message}`);
}
