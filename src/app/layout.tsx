import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life RPG",
  description: "My life, played as a game.",
  applicationName: "Life RPG",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // iPhone home-screen app: full screen, dark status bar over the page.
  appleWebApp: { capable: true, title: "Life RPG", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  viewportFit: "cover", // draw under the notch; globals.css pads for it
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
