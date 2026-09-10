import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Day Planner",
  description: "Планувальник дня — MVP",
  // iOS "Додати на головний екран" читає apple-touch-icon, не манiфест (app/manifest.ts).
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
