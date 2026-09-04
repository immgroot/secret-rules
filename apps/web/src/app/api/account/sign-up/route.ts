import { authRuntimeConfigured } from "@/auth/environment.ts";
import { auth } from "@/auth/server.ts";
import { SignUpSchema } from "@/auth/validation.ts";

export async function POST(request: Request) {
  if (!authRuntimeConfigured()) return Response.json({ message: "Account services are not configured on this environment." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const result = SignUpSchema.safeParse(body);
  if (!result.success) return Response.json({ message: result.error.issues[0]?.message ?? "Check your account details." }, { status: 400 });
  const account = { name: result.data.name, username: result.data.username, displayUsername: result.data.username, email: result.data.email, password: result.data.password, avatarId: result.data.avatarId };
  const upstream = new Request(new URL("/api/auth/sign-up/email", request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(account),
  });
  return auth.handler(upstream);
}
