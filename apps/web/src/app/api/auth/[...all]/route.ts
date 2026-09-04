import { toNextJsHandler } from "better-auth/next-js";
import { authRuntimeConfigured } from "@/auth/environment.ts";
import { auth } from "@/auth/server.ts";
import { openEmailVerificationRequest } from "@/auth/verification.ts";

const handlers = toNextJsHandler(auth);

function unavailable() {
  return Response.json({ message: "Account services are not configured on this environment." }, { status: 503 });
}

export async function GET(request: Request) {
  if (!authRuntimeConfigured()) return unavailable();
  const pathname = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "");
  if (pathname === "/api/auth/verify-email") {
    try {
      return await handlers.GET(await openEmailVerificationRequest(request));
    } catch {
      return Response.json({ message: "Invalid or expired verification link." }, { status: 400 });
    }
  }
  return handlers.GET(request);
}
export const POST = authRuntimeConfigured() ? handlers.POST : unavailable;
