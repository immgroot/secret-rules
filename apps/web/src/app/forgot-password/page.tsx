import Link from "next/link.js";
import { AuthShell } from "@/components/auth/auth-shell.tsx";
import { ForgotPasswordForm } from "@/components/auth/password-recovery.tsx";

export default function ForgotPasswordPage() {
  return <AuthShell eyebrow="ACCOUNT RECOVERY" title="FORGOT PASSWORD?" subtitle="Request a secure one-time reset link." footer={<Link href="/sign-in">BACK TO SIGN IN</Link>}><ForgotPasswordForm /></AuthShell>;
}
