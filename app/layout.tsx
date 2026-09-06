import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Day Planner",
  description: "Планувальник дня — MVP, Етап 1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
