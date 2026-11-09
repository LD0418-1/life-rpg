import type { MetadataRoute } from "next";

// Lets phones install the site as an app (home-screen icon, full screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life RPG",
    short_name: "Life RPG",
    description: "My life, played as a game.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
