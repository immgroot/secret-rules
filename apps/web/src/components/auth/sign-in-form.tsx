"use client";

import Link from "next/link.js";
import { useSearchParams } from "next/navigation.js";
import { useState, type FormEvent } from "react";
import { authClient } from "@/auth/client.ts";
import { SignInSchema, safeInternalPath } from "@/auth/validation.ts";
import { FormMessage, PasswordField, SocialButtons } from "./auth-controls.tsx";

export function SignInForm({ google, discord }: { google: boolean; discord: boolean }) {
  const query = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(query.get("verified") ? "EMAIL VERIFIED. YOU CAN SIGN IN." : null);
  const callbackURL = safeInternalPath(query.get("next"), "/");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = SignInSchema.safeParse({ email, password });
    if (!parsed.success) { setMessage("Invalid email or password."); return; }
    setBusy(true); setMessage(null);
    const result = await authClient.signIn.email({ ...parsed.data, callbackURL });
    setBusy(false);
    if (result.error) { setMessage("Invalid email or password."); return; }
    window.location.assign(callbackURL);
  }
  return <>
    <SocialButtons google={google} discord={discord} callbackURL={callbackURL} />
    <div className="auth-divider"><span>OR</span></div>
    <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <label className="auth-field"><span>EMAIL</span><input type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <PasswordField label="PASSWORD" value={password} onChange={(event) => setPassword(event.target.value)} required />
      <Link className="auth-text-link" href="/forgot-password">FORGOT PASSWORD?</Link>
      <FormMessage message={message} success={Boolean(query.get("verified"))} />
      <button className="auth-submit" disabled={busy}>{busy ? "CHECKING…" : "SIGN IN"}</button>
    </form>
  </>;
}
