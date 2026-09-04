"use client";

import Link from "next/link.js";
import { useState } from "react";
import { authClient } from "../../auth/client.ts";

export function AuthNavigation() {
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  if (session.isPending) return <span className="auth-nav-placeholder" aria-hidden="true" />;
  if (!session.data) return <Link className="auth-nav-sign-in" href="/sign-in">SIGN IN</Link>;
  const user = session.data.user;
  return <div className="auth-nav-profile"><button aria-expanded={open} onClick={() => setOpen((current) => !current)}><i data-avatar={user.avatarId ?? "lime"} /><span>{user.name}</span></button>{open && <div className="auth-profile-menu"><Link href="/account">PROFILE</Link><Link href="/account#security">ACCOUNT</Link><button onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign("/") } })}>SIGN OUT</button></div>}</div>;
}
