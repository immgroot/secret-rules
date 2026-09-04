import { authBaseURL } from "./environment.ts";

type AuthEmail = Readonly<{ to: string; subject: string; preheader: string; heading: string; body: string; action: string; url: string }>;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function approvedAuthURL(value: string) {
  const url = new URL(value);
  if (url.origin !== new URL(authBaseURL).origin || !url.pathname.startsWith("/api/auth/")) throw new Error("Authentication email URL was not allowlisted.");
  return url.toString();
}

export async function sendAuthEmail(message: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Transactional email is not configured.");
  const actionURL = approvedAuthURL(message.url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: `${message.heading}\n\n${message.body}\n\n${actionURL}\n\nIf you did not request this, you can ignore this email.`,
      html: `<div style="background:#0b0e09;padding:32px;font-family:Arial,sans-serif;color:#f3ead2"><div style="max-width:520px;margin:auto;border:1px solid #d4f46255;background:#151a12;padding:28px"><p style="color:#d4f462;font-size:12px;letter-spacing:2px">SECRET RULES · PRIVATE ACCOUNT MESSAGE</p><h1 style="font-size:32px;line-height:1;margin:20px 0">${escapeHtml(message.heading)}</h1><p style="color:#c9c0aa;line-height:1.6">${escapeHtml(message.body)}</p><a href="${escapeHtml(actionURL)}" style="display:inline-block;margin:18px 0;padding:13px 18px;background:#d4f462;color:#111;font-weight:800;text-decoration:none">${escapeHtml(message.action)}</a><p style="color:#8f8979;font-size:12px">If you did not request this, you can ignore this email.</p></div></div>`,
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    }),
  });
  if (!response.ok) throw new Error("Transactional email provider rejected the request.");
}

export function verificationEmail(to: string, url: string): AuthEmail {
  return { to, url, subject: "Verify your SECRET RULES account", preheader: "Confirm your player identity.", heading: "VERIFY YOUR PLAYER IDENTITY", body: "Confirm this email to activate your persistent SECRET RULES account.", action: "VERIFY EMAIL" };
}

export function resetEmail(to: string, url: string): AuthEmail {
  return { to, url, subject: "Reset your SECRET RULES password", preheader: "A password reset was requested.", heading: "RESET YOUR PASSWORD", body: "This secure link expires in one hour and can be used once.", action: "RESET PASSWORD" };
}
