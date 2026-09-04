import { authProviders } from "@/auth/environment.ts";
import { AuthShell } from "@/components/auth/auth-shell.tsx";
import { SignUpForm } from "@/components/auth/sign-up-form.tsx";

export default function SignUpPage() {
  return <AuthShell eyebrow="PERSISTENT PLAYER ID" title="JOIN SECRET RULES" subtitle="Create your player identity."><SignUpForm {...authProviders} /></AuthShell>;
}
