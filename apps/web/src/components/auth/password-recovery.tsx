"use client";

import Link from "next/link.js";
import { useSearchParams } from "next/navigation.js";
import { useState, type FormEvent } from "react";
import { authClient } from "@/auth/client.ts";
import { ResetPasswordSchema, ResetRequestSchema } from "@/auth/validation.ts";
import { FormMessage, PasswordField } from "./auth-controls.tsx";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ResetRequestSchema.safeParse({ email });
    if (!parsed.success) return;
    setBusy(true);
    await authClient.requestPasswordReset({ email: parsed.data.email, redirectTo: "/reset-password" });
    setBusy(false); setSent(true);
  }
  if (sent) return <div className="auth-sent"><span>REQUEST RECEIVED</span><h2>CHECK YOUR EMAIL</h2><p>If an eligible account exists, a one-time password reset link is on its way.</p><Link className="auth-submit" href="/sign-in">RETURN TO SIGN IN</Link></div>;
  return <form className="auth-form" onSubmit={(event) => void submit(event)}><label className="auth-field"><span>EMAIL</span><input type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><p className="auth-helper">We always show the same confirmation, whether or not an account exists.</p><button className="auth-submit" disabled={busy}>{busy ? "REQUESTING…" : "SEND RESET LINK"}</button></form>;
}

export function ResetPasswordForm() {
  const query = useSearchParams();
  const token = query.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(token ? null : "THIS RESET LINK IS MISSING OR INVALID.");
  const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ResetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the new password."); return; }
    setBusy(true); setMessage(null);
    const result = await authClient.resetPassword({ newPassword: parsed.data.password, token: parsed.data.token });
    setBusy(false);
    if (result.error) { setMessage("THIS RESET LINK IS INVALID OR HAS EXPIRED."); return; }
    setComplete(true);
  }
  if (complete) return <div className="auth-sent"><span>SECURITY UPDATED</span><h2>PASSWORD CHANGED</h2><p>Existing sessions were revoked. Sign in again with your new password.</p><Link className="auth-submit" href="/sign-in">SIGN IN</Link></div>;
  return <form className="auth-form" onSubmit={(event) => void submit(event)}><PasswordField label="NEW PASSWORD" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} hint required /><PasswordField label="CONFIRM NEW PASSWORD" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><FormMessage message={message} /><button className="auth-submit" disabled={busy || !token}>{busy ? "UPDATING…" : "SET NEW PASSWORD"}</button></form>;
}
