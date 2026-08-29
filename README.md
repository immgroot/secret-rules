# SECRET RULES

A commercial browser party game for **4–10 players**. One public challenge,
individual private objectives and conflicting incentives invite bluffing and chaos.

## Current status: Phase 3.3 — Premium table + configurable round timer

Create a named private/public room, optionally password-protect/lock it, join as a
player or spectator, chat, ready up and use validated room/player controls. The
server owns unique colors, roles, AFK, removal, host transfer and every shared
mutation. Refresh resumes the same player through a private room credential.

The first full synchronized round is playable: the host starts The Button after
4–10 active players ready up, each player receives and acknowledges one private
Button rule, the server runs the countdown and the lobby-selected 30–300 second
clock (80 seconds by default), and validated
press intentions move one shared counter toward exactly 20. Private progress,
hidden modifiers, resolution, reveal, reconnect, spectators, and another Button
round all use the existing RoomOwner and Secret Rule Engine. The approved gameplay presents
that round as a responsive tabletop with count-aware seats, a physical Button,
focused rule reading, a compact HUD and overlay chat. The server enforces one
shared recharge deadline and prevents the previous accepted actor from pressing
again until someone else takes a turn. Gameplay now sits on one reusable,
responsive physical table with dynamic perimeter seats, a centered mechanical
counter and Button, a compact table log, overlay chat and the existing private
Secret card interaction.

Round reveals now publish server-calculated additive point breakdowns and tied
standings. The configured final round automatically becomes a real match-complete
screen with authoritative single or tied winners. The host may safely return the
same room to the lobby; room identity, players, host, settings and chat remain,
while scores, readiness, rounds, private rules and Button state reset.

The homepage Button remains an isolated teaching animation. The room Button is
server-authoritative. Match scoring is in-memory and resets in the lobby. No
database, accounts, payments,
matchmaking, public browser, voice, or second mini-game is implemented. Do not
start Phase 4 without approval.
Read [AGENTS.md](./AGENTS.md) before making changes.

## Stack and dependencies

Next.js App Router / React / strict TypeScript / Tailwind CSS; a separate Node.js
service with Socket.IO; Zod shared contracts; pnpm workspaces; ESLint; Node tests.
No extra state manager, UI kit, realtime framework, database or test runner.

| Direct dependencies | Version |
| --- | --- |
| next, @next/eslint-plugin-next | 16.3.3 |
| react, react-dom | 19.2.8 |
| socket.io, socket.io-client | 4.8.3 |
| zod | 4.4.3 |
| tailwindcss, @tailwindcss/postcss | 4.3.3 |
| postcss | 8.5.26 |
| typescript | 6.0.3 |
| eslint / @eslint/js | 10.9.1 / 10.0.1 |
| eslint-plugin-react-hooks / typescript-eslint | 7.1.1 / 8.68.0 |
| @types/node | 24.13.3 |
| @types/react / @types/react-dom | 19.2.18 / 19.2.5 |

Phase 3.3 installs no dependencies. It uses the existing browser/server stack and
Node cryptography. The lockfile and package versions are unchanged.

All packages remain private and UNLICENSED. Local third-party fonts retain their
OFL licenses and provenance under `apps/web/src/styles/fonts`. Original artwork
is SVG; no downloaded image/audio library or heavy UI dependency was added.

## Run locally

Requirements: Node **24.19.0 or newer Node 24**, pnpm **11.19.0**. Use both on PATH.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [SECRET RULES](http://127.0.0.1:3000). Realtime uses port 3001;
[GET /health](http://127.0.0.1:3001/health) verifies the Node process. Ctrl+C stops
both services. Development binds to loopback; this is not a LAN deployment recipe.

`pnpm dev` builds shared contracts first, then watches all three packages. A
server/shared change can restart Node and clear in-memory rooms. Use one browser
origin consistently: localhost and 127.0.0.1 have different browser storage.

The homepage connects lazily on create/join, or automatically to resume its own
saved session. No account is required. [PHASE_1_6.md](./docs/PHASE_1_6.md) contains the
exact four-window walkthrough, disconnect tests and known limitations.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Shared build, then web/server/shared development watchers |
| `pnpm build:shared` | Compile browser-safe shared schemas/types |
| `pnpm typecheck` | Generate Next route types and strictly check all packages |
| `pnpm lint` | ESLint, zero warnings allowed |
| `pnpm test` | Shared build, real Socket.IO integration and Node unit/presentation tests |
| `pnpm build` | Shared, server and optimized Next production builds |
| `pnpm start` | Run both built apps locally; build first |
| `pnpm brand:generate` | Regenerate original SVG assets from the canonical source |
| `pnpm rules:inspect -- --players=6 --chaos=normal --seed=my-seed` | Print a development-only sample set |
| `pnpm rules:simulate` | Run 1,200 generated sets and print real quality/privacy-adjacent statistics |

Run typecheck, lint, test and build after important application changes. Local
start is not a public hosting configuration. Production Node startup requires
explicit HOST, PORT and ALLOWED_ORIGINS when NODE_ENV=production.

## Structure

```text
apps/
  web/
    src/app/                    # Homepage, root providers, /join/[code], /room/[code]
    src/components/
      brand/                    # Canonical original vector logo
      icons/                    # One existing line icon family
      home/demo/                # Isolated public teaching script
      home/                     # Approved homepage, tutorial and preferences UI
      lobby/                    # Entry forms, roster, room settings, reconnect UI
      game/                     # Reusable GameShell, seating, chat/secret drawers, Button UI
      ui/                       # Shared presentation components
    src/multiplayer/            # One client/store, sessions, version filtering, provider
    src/preferences/            # Local sound/motion settings
    src/audio/                  # Optional original synthesized UI sounds
    src/styles/                 # Tokens, existing styles, lobby.css and local fonts
    src/config/                 # Validated public URL
    public/brand/               # SVG assets
    test/                       # Presentation, interaction and lobby helper tests
  server/
    src/config/                 # Server-only environment validation
    src/realtime/               # Socket.IO boundary and bounded limiter
    src/rooms/                  # One authoritative RoomOwner and public projection
    src/rules/                  # Server-only catalog, generator, graph, history and dev tools
    src/games/button/           # Button pack, modifiers, events and evaluator adapter
    src/server.ts               # HTTP and realtime composition
    src/index.ts                # Startup/shutdown
    test/                       # Health/config, real clients, lifecycle/limiter tests
packages/shared/src/            # Browser-safe event/rule schemas, inferred types, errors, health
scripts/                        # Brand asset generator
docs/                           # Architecture, protocol, product, design, phase handoffs
AGENTS.md                       # Permanent authority/privacy and scope rules
```

Each app has package/TypeScript configuration and `.env.example`. Root configs
contain strict TypeScript defaults, flat ESLint import boundaries, pinned pnpm,
workspace definitions, lockfile, editor settings and Git ignores. Dependencies,
.next, dist, test output, logs, real env files and `.local/qa` are ignored.

## Safe environment configuration

Local defaults work without real environment files. To customize in PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/server/.env.example apps/server/.env
```

| App | Variable | Default / behavior |
| --- | --- | --- |
| Web | NEXT_PUBLIC_REALTIME_URL | http://localhost:3001; public HTTP(S) Socket.IO URL |
| Server | NODE_ENV | development; also test/production |
| Server | HOST | 127.0.0.1; explicit in production |
| Server | PORT | 3001; explicit in production |
| Server | ALLOWED_ORIGINS | localhost and 127.0.0.1 on ports 3000/3100 in development; explicit exact origins in production |
| Server | RECONNECT_GRACE_MS | 60000; accepted range 1000–300000 |
| Server | ROOM_IDLE_TIMEOUT_MS | 7200000; accepted range 60000–86400000 |
| Server | AFK_TIMEOUT_MS | 180000; accepted range 1000–900000 |

ALLOWED_ORIGINS is comma-separated, with no wildcards, paths or credentials.
Next loads web env files from apps/web; Node scripts optionally load server/.env.
There is no root env loader. Configuration errors expose field names, not values.

NEXT_PUBLIC values are embedded in browser code at build time. Never place a
secret there. Rebuild with the correct realtime URL before deployment. No external
service secret is needed. Real room bearer credentials are generated at runtime;
keep them out of Git, logs, URLs, public snapshots and React render props.

## Authority, sessions and limits

One synchronous RoomOwner owns each room. Public snapshots are built with an
explicit field allowlist, validated with Zod and sent only to authorized members.
The browser submits intentions, then renders server results; it never computes
scores, deadlines, randomness, host selection or authoritative room state.

Each browser tab keeps only its own room-scoped credential in sessionStorage.
Refresh preserves it. New independent windows are separate players; Duplicate Tab
may copy the credential and cause an intentional session takeover. Explicit leave
revokes membership immediately. Closing a tab is a disconnect, not a leave.

The MVP uses one in-memory server. Restarting it loses rooms. Public deployment
still needs TLS, proxy/IP review, operational hardening and load/failure testing.
The origin allowlist and bounded in-process limits are not a DDoS defense.

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md): boundaries, ownership and reusable gameplay architecture.
- [MULTIPLAYER.md](./docs/MULTIPLAYER.md): exact events, authority, lifecycle, privacy, limits and errors.
- [PHASE_1_6.md](./docs/PHASE_1_6.md): historical lobby implementation and four-session test guide.
- [SECRET_RULE_ENGINE.md](./docs/SECRET_RULE_ENGINE.md): Phase 2 rule models, privacy boundaries, generation and dev tools.
- [BUTTON_GAME.md](./docs/BUTTON_GAME.md): The Button lifecycle, rules, modifiers, synchronization and reveal.
- [SCORING.md](./docs/SCORING.md): authoritative point formula, privacy timing, standings and reset.
- [BUTTON_MAYHEM.md](./docs/BUTTON_MAYHEM.md): non-playable Mayhem mode design boundary.
- [GAME_DESIGN.md](./docs/GAME_DESIGN.md): product concept and open gameplay decisions.
- [DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md): approved branding, tokens, components and accessibility.
- [PHASE_0_6.md](./docs/PHASE_0_6.md): historical homepage interaction handoff.
- [ROADMAP.md](./docs/ROADMAP.md): explicitly gated future work.

**Stop at Phase 3.3. Phase 4, Mayhem gameplay and every additional mini-game require approval.**
