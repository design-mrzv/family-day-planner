import type { MetadataRoute } from "next";

// Мінімальний маніфест — тільки щоб пройти installability-критерії для push
// (Add to Home Screen на iOS, "Install" на Android/Chrome). Іконка суто функціональна,
// не дизайн-рішення — дизайн лишається до Етапу 5.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Day Planner",
    short_name: "Planner",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
