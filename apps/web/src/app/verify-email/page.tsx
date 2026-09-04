import Link from "next/link.js";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default function VerifyEmailPage() {
  return <AuthShell eyebrow="EMAIL VERIFICATION" title="CHECK YOUR EMAIL" subtitle="Open the one-time verification link we sent. The link expires after one hour."><div className="auth-sent"><p>Your email address stays private and is never shown in multiplayer rooms.</p><Link className="auth-submit" href="/sign-in">RETURN TO SIGN IN</Link><Link className="auth-quiet" href="/sign-up">CHANGE EMAIL</Link></div></AuthShell>;
}
