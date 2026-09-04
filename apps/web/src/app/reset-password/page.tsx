import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell.tsx";
import { ResetPasswordForm } from "@/components/auth/password-recovery.tsx";

export default function ResetPasswordPage() {
  return <AuthShell eyebrow="SECURE RESET" title="CHOOSE A NEW PASSWORD" subtitle="The reset link expires after one hour and works once."><Suspense fallback={<p className="auth-account-loading">CHECKING RESET LINK…</p>}><ResetPasswordForm /></Suspense></AuthShell>;
}
