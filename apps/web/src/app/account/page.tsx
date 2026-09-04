import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import { authProviders, authRuntimeConfigured } from "@/auth/environment.ts";
import { auth } from "@/auth/server.ts";
import { AccountPanel } from "@/components/auth/account-panel.tsx";
import { AuthShell } from "@/components/auth/auth-shell.tsx";

export default async function AccountPage() {
  if (!authRuntimeConfigured()) return <AuthShell eyebrow="ACCOUNT SERVICES" title="NOT CONFIGURED" subtitle="This environment is missing its private account service configuration."><p className="auth-helper">Guest play remains available from the homepage.</p></AuthShell>;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=/account");
  return <AuthShell eyebrow="PRIVATE PLAYER FILE" title="ACCOUNT" subtitle="Profile, connections, password, and sessions."><AccountPanel {...authProviders} /></AuthShell>;
}
