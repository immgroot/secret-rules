"use client";

import Link from "next/link.js";
import { useEffect, useState, type FormEvent } from "react";
import { AVATAR_IDS, AVATAR_LABELS } from "@secret-rules/shared";
import { authClient } from "@/auth/client.ts";
import { AuthPasswordSchema } from "@/auth/validation.ts";
import { FormMessage, PasswordField, SocialButtons } from "./auth-controls.tsx";

type LinkedAccount = { id: string; providerId: string; accountId: string };
type ActiveSession = { id: string; token: string; userAgent?: string | null; createdAt: Date | string; expiresAt: Date | string };

export function AccountPanel({ google, discord }: { google: boolean; discord: boolean }) {
  const session = authClient.useSession();
  if (session.isPending) return <div className="auth-account-loading">CHECKING YOUR IDENTITY…</div>;
  if (!session.data) return <div className="auth-sent"><h2>SESSION ENDED</h2><Link className="auth-submit" href="/sign-in?next=/account">SIGN IN</Link></div>;
  return <AccountDetails key={session.data.user.id} user={session.data.user} google={google} discord={discord} />;
}

function AccountDetails({ user, google, discord }: {
  user: { name: string; avatarId?: string | null };
  google: boolean;
  discord: boolean;
}) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [name, setName] = useState(user.name);
  const [avatarId, setAvatarId] = useState(user.avatarId ?? "lime");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([authClient.listAccounts(), authClient.listSessions()]).then(([accountResult, sessionResult]) => {
      if (!active) return;
      if (accountResult.data) setAccounts(accountResult.data as LinkedAccount[]);
      if (sessionResult.data) setSessions(sessionResult.data as ActiveSession[]);
    });
    return () => { active = false; };
  }, []);
  const passwordAccount = accounts.some((account) => account.providerId === "credential");
  async function updateProfile(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    const result = await authClient.updateUser({ name, avatarId });
    setMessage(result.error ? "PROFILE COULD NOT BE UPDATED." : "PROFILE UPDATED.");
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    if (newPassword !== confirmPassword || !AuthPasswordSchema.safeParse(newPassword).success) { setMessage("CHECK THE NEW PASSWORD AND CONFIRMATION."); return; }
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) { setMessage("CURRENT PASSWORD WAS NOT ACCEPTED."); return; }
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("PASSWORD CHANGED. OTHER SESSIONS WERE REVOKED.");
  }
  async function unlink(account: LinkedAccount) {
    if (accounts.length <= 1) return;
    const result = await authClient.unlinkAccount({ accountId: account.id });
    if (result.error) { setMessage("THAT ACCOUNT COULD NOT BE DISCONNECTED."); return; }
    setAccounts((current) => current.filter((candidate) => candidate.id !== account.id));
  }
  async function revoke(token: string) {
    const result = await authClient.revokeSession({ token });
    if (!result.error) setSessions((current) => current.filter((candidate) => candidate.token !== token));
  }
  return <div className="account-grid">
    <section className="account-section"><header><span>PUBLIC PLAYER CARD</span><h2>PROFILE</h2></header><form className="auth-form" onSubmit={(event) => void updateProfile(event)}><label className="auth-field"><span>DISPLAY NAME</span><input value={name} minLength={2} maxLength={20} onChange={(event) => setName(event.target.value)} required /></label><fieldset className="avatar-picker"><legend>AVATAR</legend>{AVATAR_IDS.map((avatar) => <button key={avatar} type="button" data-selected={avatarId === avatar} onClick={() => setAvatarId(avatar)}><i data-avatar={avatar} />{AVATAR_LABELS[avatar]}</button>)}</fieldset><button className="auth-submit">SAVE PROFILE</button></form></section>
    <section className="account-section"><header><span>EXPLICIT LINKS ONLY</span><h2>CONNECTED ACCOUNTS</h2></header><div className="connected-accounts">{accounts.map((account) => <div key={account.id}><strong>{account.providerId.toUpperCase()}</strong><span>CONNECTED</span>{accounts.length > 1 && account.providerId !== "credential" && <button onClick={() => void unlink(account)}>DISCONNECT</button>}</div>)}</div><SocialButtons google={google && !accounts.some((account) => account.providerId === "google")} discord={discord && !accounts.some((account) => account.providerId === "discord")} callbackURL="/account" linking /></section>
    <section className="account-section"><header><span>ACCOUNT SECURITY</span><h2>PASSWORD</h2></header>{passwordAccount ? <form className="auth-form" onSubmit={(event) => void changePassword(event)}><PasswordField label="CURRENT PASSWORD" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><PasswordField label="NEW PASSWORD" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} hint required /><PasswordField label="CONFIRM NEW PASSWORD" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button className="auth-submit">CHANGE PASSWORD</button></form> : <p className="auth-helper">This account signs in through a connected provider. No local password is set.</p>}</section>
    <section className="account-section"><header><span>AUTHENTICATED DEVICES</span><h2>ACTIVE SESSIONS</h2></header><div className="active-sessions">{sessions.map((active, index) => <div key={active.id}><span>{index === 0 ? "CURRENT OR RECENT SESSION" : "SIGNED-IN SESSION"}</span><small>{active.userAgent?.slice(0, 80) || "UNKNOWN DEVICE"}</small>{index > 0 && <button onClick={() => void revoke(active.token)}>SIGN OUT</button>}</div>)}</div><button className="auth-quiet" onClick={() => void authClient.revokeOtherSessions().then(() => setMessage("OTHER SESSIONS SIGNED OUT."))}>SIGN OUT OTHER SESSIONS</button></section>
    <FormMessage message={message} success={Boolean(message?.includes("UPDATED") || message?.includes("CHANGED") || message?.includes("SIGNED OUT"))} />
    <button className="auth-sign-out" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign("/") } })}>SIGN OUT</button>
  </div>;
}
