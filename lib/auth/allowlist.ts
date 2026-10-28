// Приватна бета: поки домен у Resend не підтверджено, листи йдуть лише на адресу
// власника акаунта. Щоб стороння людина бачила чесне "ще не для всіх", а не
// незрозумілу помилку відправки, вхід обмежений списком AUTH_ALLOWED_EMAILS
// (адреси через кому).
//
// Порожній/незаданий список = пускати всіх. Саме так, а не навпаки: помилка в
// конфігурації не має замикати власника поза власним застосунком.
export function isEmailAllowed(email: string, rawList: string | undefined): boolean {
  const allowed = (rawList ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}
