"use client";

import { useState, type InputHTMLAttributes } from "react";
import { authClient } from "@/auth/client.ts";
import { passwordStrength } from "@/auth/validation.ts";

export function PasswordField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: boolean }) {
  const [visible, setVisible] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  return <label className="auth-field"><span>{label}</span><span className="auth-input-wrap"><input {...props} type={visible ? "text" : "password"} autoComplete={props.autoComplete ?? "current-password"} /><button type="button" onClick={() => setVisible((current) => !current)} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}>{visible ? "HIDE" : "SHOW"}</button></span>{hint && <small>12–128 characters · passphrases welcome · {passwordStrength(value)}</small>}</label>;
}

export function SocialButtons({ google, discord, callbackURL = "/account", linking = false }: { google: boolean; discord: boolean; callbackURL?: string; linking?: boolean }) {
  async function social(provider: "google" | "discord") {
    if (linking) await authClient.linkSocial({ provider, callbackURL });
    else await authClient.signIn.social({ provider, callbackURL });
  }
  if (!google && !discord) return <p className="auth-provider-note">SOCIAL SIGN-IN IS NOT CONFIGURED IN THIS ENVIRONMENT.</p>;
  return <div className="auth-socials">
    {google && <button type="button" onClick={() => void social("google")}><i>G</i>{linking ? "CONNECT GOOGLE" : "CONTINUE WITH GOOGLE"}</button>}
    {discord && <button type="button" onClick={() => void social("discord")}><i>◖◗</i>{linking ? "CONNECT DISCORD" : "CONTINUE WITH DISCORD"}</button>}
  </div>;
}

export function FormMessage({ message, success = false }: { message: string | null; success?: boolean }) {
  return message ? <p className="auth-message" data-success={success} role="status">{message}</p> : null;
}
