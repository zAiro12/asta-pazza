import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Asta Pazza",
    template: "%s | Asta Pazza",
  },
  description:
    "Gioco di aste al buio in tempo reale. Offri, vinci e bluffa con i tuoi amici.",
  keywords: ["asta", "gioco", "aste al buio", "multiplayer", "party game"],
  robots: { index: true, follow: true },

  // ── Open Graph (WhatsApp, Telegram, Discord, Facebook) ──────────────────
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Asta Pazza",
    title: "Asta Pazza — Gioco di aste al buio",
    description: "Offri, vinci e bluffa con i tuoi amici.",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "Asta Pazza" },
    ],
    locale: "it_IT",
  },

  // ── Twitter / X ─────────────────────────────────────────────────────────
  twitter: {
    card: "summary_large_image",
    title: "Asta Pazza — Gioco di aste al buio",
    description: "Offri, vinci e bluffa con i tuoi amici.",
    images: ["/og-image.png"],
  },

  // ── PWA + icone ─────────────────────────────────────────────────────────
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Asta Pazza",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <head>
        <meta name="theme-color" content="#030712" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js');
            });
          }
        `,
          }}
        />
      </head>
      <body className="bg-dark-bg text-white min-h-screen">
        <SpeedInsights />
        {children}
      </body>
    </html>
  );
}
