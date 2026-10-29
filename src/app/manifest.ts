import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BodyMetrics",
    short_name: "BodyMetrics",
    description: "Nhật ký ăn uống, tập luyện và cân nặng",
    lang: "vi",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f9f6e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chụp món ăn", url: "/meals/new" },
      { name: "Ghi buổi tập", url: "/workouts/new" },
    ],
  };
}
