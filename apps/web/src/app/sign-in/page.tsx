import Link from "next/link.js";
import { Suspense } from "react";
import { authProviders } from "@/auth/environment.ts";
import { AuthShell } from "@/components/auth/auth-shell.tsx";
import { SignInForm } from "@/components/auth/sign-in-form.tsx";

export default function SignInPage() {
  return <AuthShell eyebrow="PLAYER ACCESS" title="WELCOME BACK" subtitle="Same game. Different rules." footer={<>DON&apos;T HAVE AN ACCOUNT? <Link href="/sign-up">CREATE ACCOUNT</Link></>}><Suspense fallback={<p className="auth-account-loading">PREPARING SIGN IN…</p>}><SignInForm {...authProviders} /></Suspense></AuthShell>;
}
