import type { MetadataRoute } from "next";

// Installability-критерії для push (Add to Home Screen на iOS, "Install" на Android/Chrome).
// Кольори — той самий акцент/фон, що app/globals.css (Етап 5).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Day Planner",
    short_name: "Planner",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#2f6f6b",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
