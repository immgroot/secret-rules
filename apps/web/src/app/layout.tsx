import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { AppProviders } from "./providers.tsx";

const display = localFont({ src: "../styles/fonts/BarlowCondensed-ExtraBold.ttf", weight: "800", variable: "--font-display", display: "swap" });
const ui = localFont({ src: "../styles/fonts/DMSans-Variable.ttf", weight: "100 1000", variable: "--font-ui", display: "swap" });
const secret = localFont({ src: "../styles/fonts/IBMPlexMono-Medium.ttf", weight: "500", variable: "--font-secret", display: "swap" });

export const metadata: Metadata = {
  title: "SECRET RULES",
  description: "A 4–10 player online browser party game about private objectives, bluffing, accusations, and chaos.",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/brand/secret-rules-app-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/secret-rules-app-icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/brand/favicon.svg",
    apple: [{ url: "/brand/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${secret.variable}`}>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
