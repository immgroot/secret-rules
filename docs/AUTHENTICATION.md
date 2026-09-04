# Authentication and Accounts

SECRET RULES uses Better Auth 1.7 with the Prisma adapter and PostgreSQL. Better
Auth owns session cookies, OAuth state/callback validation, email verification,
password-reset tokens, provider-account linking and session invalidation. The
project supplies strict input validation, Argon2id password hashing, branded
email delivery and the account UI. It does not implement a parallel auth
protocol.

Accounts are optional. Guest room play and the existing room-scoped reconnect
credential remain supported. Account identity never replaces server-side room,
role, phase, turn, target or private-state authorization.

## Persistent models

The additive Prisma migration creates:

- `User`: stable identity, normalized unique email/username, display name,
  verification state and public avatar choice;
- `Account`: one issuer-scoped credential or OAuth provider account; Better Auth
  encrypts stored OAuth tokens using its built-in encryption option;
- `Session`: random unique token, expiry, client metadata and owning user;
- `Verification`: expiring, consumable verification/reset state;
- `Jwks`: Better Auth's Ed25519 signing key material;
- `RateLimit`: database-backed counters shared by web instances.

Room state, hands, Secrets, scores and match history are intentionally not in
PostgreSQL. Deleting or restarting the realtime service still clears rooms.

## Email and password

Sign-up validates display name, normalized email, normalized username, avatar,
password and confirmation on the server. Passwords allow paste and passphrases,
are 12–128 characters, are never trimmed, and are hashed with Argon2id using
64 MiB memory, three iterations, one lane, a 32-byte output and a fresh random
salt. No password or digest is sent to the browser.

New email accounts cannot sign in until Better Auth consumes the one-hour,
single-use verification link. Resend delivers verification and reset messages;
request routes use generic responses so account existence is not disclosed.
Verification links wrap the framework's signed token using Better Auth's own
authenticated JWT encryption, so the email claim is not readable from the URL.
Only the opaque token's digest is stored. The web route checks expiry and consumes
that digest atomically before passing the inner token to Better Auth's verifier.
Password reset links expire after one hour, are consumed once, and successful
reset revokes existing sessions. Reset identifiers are hashed by Better Auth
before database storage. The UI treats reset tokens as opaque framework values,
not as a project-defined fixed-length format. Sign-out deletes the current session.

## Google, Discord and linking

Google requests only `openid email profile`. Discord requests only
`identify email`. Better Auth validates provider responses, OAuth state and
callbacks. Register these exact production callback URLs with each provider:

```text
https://YOUR-WEB-DOMAIN/api/auth/callback/google
https://YOUR-WEB-DOMAIN/api/auth/callback/discord
```

Implicit same-email linking is disabled. A signed-in, recently authenticated
user can explicitly connect a provider from Account settings. Local email must
already be verified. A matching arbitrary email is never sufficient to merge
identities. Connected accounts can be disconnected only through the authenticated
account route and the UI prevents intentionally removing the last sign-in method.

## Session and request security

Production account cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`
and use a dedicated prefix. Sessions expire after 14 days, refresh at most daily,
and are fresh for 30 minutes. Better Auth origin, CSRF, OAuth state and callback
checks remain enabled. Redirects accepted by project forms are same-origin paths
only. The web service applies CSP, frame-ancestors, nosniff, referrer,
permissions and HSTS headers.

Database-backed limits cover email login, sign-up, verification resend, reset
request/reset completion, OAuth starts and callbacks. Limits are bounded rather
than permanent email locks. Production should additionally apply edge/WAF limits
using reviewed proxy IP handling.

## Realtime association

An authenticated web client may obtain a five-minute Ed25519 JWT from
`/api/auth/token` and include it only in the Socket.IO handshake. The realtime
server validates the signature through the public JWKS endpoint and enforces the
exact issuer, audience, expiry and subject. It stores the resulting account user
ID only in server-private room membership. The browser never submits a user ID,
role or host claim, and it never stores this JWT in localStorage or sessionStorage.

Invalid presented JWTs reject the socket. No JWT preserves guest mode. Resuming
a seat still requires the room credential, and a different authenticated account
cannot use that credential to replace the associated account. Public snapshots
and private gameplay projections contain no account ID, email, provider token,
session token or password data.

## Environment

### Web service

```text
NEXT_PUBLIC_REALTIME_URL=https://YOUR-REALTIME-DOMAIN
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=AT-LEAST-32-RANDOM-CHARACTERS
BETTER_AUTH_URL=https://YOUR-WEB-DOMAIN
AUTH_JWT_ISSUER=https://YOUR-WEB-DOMAIN/api/auth
AUTH_JWT_AUDIENCE=secret-rules-realtime
RESEND_API_KEY=...
AUTH_EMAIL_FROM=SECRET RULES <accounts@YOUR-VERIFIED-DOMAIN>
GOOGLE_CLIENT_ID=                 # optional with secret
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=                # optional with secret
DISCORD_CLIENT_SECRET=
```

### Realtime service

```text
AUTH_JWKS_URL=https://YOUR-WEB-DOMAIN/api/auth/jwks
AUTH_JWT_ISSUER=https://YOUR-WEB-DOMAIN/api/auth
AUTH_JWT_AUDIENCE=secret-rules-realtime
```

All three realtime auth variables are optional as a group. Configure all three
to enable account association. OAuth IDs/secrets are also all-or-none per
provider. Only `NEXT_PUBLIC_REALTIME_URL` is public. Never put database, auth,
OAuth or email secrets in a `NEXT_PUBLIC_` variable.

## Migration and deployment

Provision PostgreSQL and set the web variables before enabling account routes.
Review and apply the committed migration without destructive commands:

```sh
pnpm --filter @secret-rules/web db:migrate:status
pnpm --filter @secret-rules/web db:migrate:deploy
```

Run `db:migrate:deploy` as a one-off release/pre-deploy command before routing
auth traffic, then build and start the web service normally. `prebuild` generates
the Prisma client but does not mutate the database. Never use `prisma migrate
reset` or `prisma db push` against production.

For Railway, attach PostgreSQL to the web service, set `DATABASE_URL`, then set
the canonical public web/realtime URLs after domains exist. Register those same
callback URLs with Google and Discord. Verify the Resend sender domain. Configure
the realtime JWKS variables only after the web JWKS endpoint is reachable.

External-provider and live-email QA requires real deployment credentials. Unit
tests use local adapters and signed test JWTs and never contact Google, Discord,
Resend or a production database.
