import Link from "next/link.js";
import type { ReactNode } from "react";
import { FullLogo } from "../brand/logo.tsx";

export function AuthShell({ eyebrow, title, subtitle, children, footer }: { eyebrow: string; title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return <main className="auth-page">
    <Link className="auth-logo" href="/" aria-label="SECRET RULES home"><FullLogo /></Link>
    <section className="auth-card" aria-labelledby="auth-heading">
      <header><span>{eyebrow}</span><h1 id="auth-heading">{title}</h1><p>{subtitle}</p></header>
      {children}
      {footer && <footer>{footer}</footer>}
    </section>
    <p className="auth-private-note">ACCOUNT DATA STAYS PRIVATE · GAME SECRETS STAY SERVER-SIDE</p>
  </main>;
}
