import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { AppProviders } from "./providers.tsx";

const display = localFont({ src: "../styles/fonts/BarlowCondensed-ExtraBold.ttf", weight: "800", variable: "--font-display", display: "swap" });
const ui = localFont({ src: "../styles/fonts/DMSans-Variable.ttf", weight: "100 1000", variable: "--font-ui", display: "swap" });
const secret = localFont({ src: "../styles/fonts/IBMPlexMono-Medium.ttf", weight: "500", variable: "--font-secret", display: "swap" });

export const metadata: Metadata = {
  title: "SECRET RULES — Same challenge. Different rules.",
  description: "A browser party game for 4–10 friends. Same challenge. Different rules. Create a room and play The Button.",
  icons: { icon: "/brand/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${secret.variable}`}>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
