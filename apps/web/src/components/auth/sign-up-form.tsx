"use client";

import Link from "next/link.js";
import { useState, type FormEvent } from "react";
import { authClient } from "@/auth/client.ts";
import { maskEmail, SignUpSchema } from "@/auth/validation.ts";
import { FormMessage, PasswordField, SocialButtons } from "./auth-controls.tsx";

type Values = { name: string; username: string; email: string; password: string; confirmPassword: string };
const empty: Values = { name: "", username: "", email: "", password: "", confirmPassword: "" };

export function SignUpForm({ google, discord }: { google: boolean; discord: boolean }) {
  const [values, setValues] = useState(empty);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const update = (field: keyof Values, value: string) => setValues((current) => ({ ...current, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = SignUpSchema.safeParse({ ...values, avatarId: "lime" });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check your account details."); return; }
    setBusy(true); setMessage(null);
    const response = await fetch("/api/account/sign-up", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
    const body = await response.json().catch(() => ({})) as { message?: string };
    setBusy(false);
    if (!response.ok) { setMessage(response.status === 422 || response.status === 400 ? (body.message ?? "Check your account details.") : "Account creation is temporarily unavailable."); return; }
    setSentTo(parsed.data.email);
  }
  async function resend() {
    if (!sentTo || busy) return;
    setBusy(true);
    await authClient.sendVerificationEmail({ email: sentTo, callbackURL: "/sign-in?verified=1" });
    setBusy(false); setMessage("IF THE ACCOUNT IS ELIGIBLE, A NEW LINK HAS BEEN SENT.");
  }
  if (sentTo) return <div className="auth-sent"><span>EMAIL VERIFICATION</span><h2>CHECK YOUR EMAIL</h2><p>We sent a one-time verification link to <strong>{maskEmail(sentTo)}</strong>.</p><button className="auth-submit" disabled={busy} onClick={() => void resend()}>{busy ? "SENDING…" : "RESEND EMAIL"}</button><button className="auth-quiet" onClick={() => { setSentTo(null); setMessage(null); }}>CHANGE EMAIL</button><FormMessage message={message} success /></div>;
  return <>
    <SocialButtons google={google} discord={discord} />
    <div className="auth-divider"><span>OR</span></div>
    <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className="auth-field"><span>DISPLAY NAME</span><input autoComplete="name" value={values.name} onChange={(event) => update("name", event.target.value)} required /></label>
      <label className="auth-field"><span>USERNAME</span><input autoComplete="username" value={values.username} onChange={(event) => update("username", event.target.value)} aria-describedby="username-help" required /><small id="username-help">3–20 letters, numbers, or underscores. Your email is never public.</small></label>
      <label className="auth-field"><span>EMAIL</span><input type="email" autoComplete="email" inputMode="email" value={values.email} onChange={(event) => update("email", event.target.value)} required /></label>
      <PasswordField label="PASSWORD" autoComplete="new-password" value={values.password} onChange={(event) => update("password", event.target.value)} hint required />
      <PasswordField label="CONFIRM PASSWORD" autoComplete="new-password" value={values.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} required />
      <FormMessage message={message} />
      <button className="auth-submit" disabled={busy}>{busy ? "CREATING…" : "CREATE ACCOUNT"}</button>
      <p className="auth-legal">By creating an account, you confirm you are eligible to use the service. Terms and Privacy pages will be added before public account launch.</p>
    </form>
    <p className="auth-switch">ALREADY HAVE AN ACCOUNT? <Link href="/sign-in">SIGN IN</Link></p>
  </>;
}
