# SECRET RULES — Engineering Rules

These rules apply to every file and every future phase of this repository. Read
this file before making changes. The product is a commercial browser party game
for 4–10 players, not a dashboard or SaaS application.

## Scope and phase discipline

- Do not continue into future development phases without being explicitly instructed.
- The current authorized phase is Button V2. Preserve the existing room, lobby,
  reconnect, social, security, Secret Rule Engine, match-completion and privacy
  systems while maintaining the server-authoritative hidden-card bluffing game.
  The current polish pass also owns match abandonment below two active players,
  client-only point-of-view seating, and accurate homepage/tutorial teaching.
- Button V2 deals five private cards. Number Cards accept only a Number claim,
  play face-down and receive one server-timed challenge window. Effect Cards
  play face-up and resolve directly with one real target/value when required;
  they never create claims or challenges. The server owns penalties, scores,
  target voting and at most one Last Chance rotation.
- Lobby Button settings are deck length, optional exact target, turn timer,
  challenge timer and match rounds. They are validated server-side and locked
  after gameplay starts. Timer authority never transfers to the client.
- The local demo is public teaching material, not real gameplay. Keep its fake
  counters and choreography in `apps/web/src/components/home/demo`. Never reuse
  this script as the future authoritative mini-game engine or network state.
- The Button is the only authorized playable mini-game. Do not implement The
  Elevator, The Bomb, The Doors, The Safe, The Train, The Auction, The Bridge,
  or any other mini-game. The approved account foundation uses Better Auth,
  Prisma and PostgreSQL only for persistent identity, provider accounts,
  sessions, verification, rate limits and profile fields. Do not persist room
  gameplay or add payments, matchmaking, a public room browser, voice,
  permanent bans, moderator roles, achievements, persistent scoring/progression,
  purchases, subscriptions or rematch/stay-together.
- Button V2 may expose server-calculated live challenge/target scores and final
  Secret results at reveal-safe phases. It must not add XP, coins, ranked
  ladders, battle passes, persistent progression, negative match totals, or
  client-calculated winners.
- V2 is the only playable Button mode. Do not revive Classic recharge/repeat
  mechanics, DOUBLE/BLOCK/PROTECT, Action Tokens, Mayhem, or the exact-20 game.
- Spectators receive public state only, never another player's private data.
- Room passwords/hashes and report details stay server-private. Invite URLs
  contain only the code. Personal mute stays local and never silences others.
- Password work must be bounded and asynchronous; recheck current membership,
  host permission and password revision before committing or admitting a join.
- Anonymous reconnect credentials are room-scoped bearer secrets, not accounts.
  Keep them out of public snapshots, URLs, logs, React render props, and HTML.
- Account sessions and room reconnect credentials are separate authorities.
  A verified account token may associate a private account ID with a room seat,
  but it never grants host, player, turn or private-game-state authorization.
- One live socket may act for a player. A credential-authorized replacement
  must revoke the previous socket before sending another room snapshot.
- Planned architecture in `docs/` is not permission to implement it.
- Keep the homepage concise and game-like. Do not create a generic AI/SaaS dashboard.
- Homepage UI demos must be labeled as public examples, never real secret
  assignments. The room reveal UI may render only the authenticated player's
  private server-delivered state and must never persist it locally.

## Permanent multiplayer rules

- The server is authoritative.
- Never trust gameplay state supplied by a client.
- Never expose one player's private secret rule to another client.
- Private information must not simply be hidden with CSS; it must not be sent to unauthorized clients.
- Validate every network payload.
- Maintain one authoritative RoomState on the server.
- Use shared TypeScript types instead of duplicating models.
- Gameplay randomness happens server-side.
- Server owns timers, scores and round results.
- Important state mutations must be synchronized.
- Design for 4–10 players.
- Player identity must not depend only on Socket.IO socket IDs because sockets change after reconnecting.
- Architecture must support reconnecting players.
- Avoid duplicate managers/systems.
- Do not introduce another realtime networking framework.
- Do not install unnecessary packages.
- Future mini-games must use a shared mini-game architecture.
- Run typecheck/lint/tests after important changes.
- Do not continue into future development phases without being explicitly instructed.

## Ownership and privacy boundaries

- `apps/web` owns rendering and local presentation state. It sends player
  intentions, never authoritative state, scores, timers, random outcomes, or
  secret rule assignments.
- `apps/web/src/auth` owns Better Auth configuration, PostgreSQL persistence,
  email delivery and short-lived account identity tokens. Account cookies remain
  HttpOnly; the browser must not persist account tokens in local storage.
- `apps/server` owns server bootstrap, room state, stable session authorization,
  the rule catalog, server-only randomness, assignment history, relationship
  graphs, generation, recipient-specific projections, The Button counter,
  action history, deadlines, private progress, and round resolution.
- `packages/shared` owns browser-safe protocol schemas and inferred TypeScript
  types. Never import `apps/server` into the web app or the shared package.
- Shared schema/type definitions may describe a private message's shape and the
  authenticated recipient's generated rule; they must not contain the full rule
  catalog, credentials, server seeds, relationship graphs, other players'
  assignments, or authoritative server state.
- Never serialize a full RoomState to clients. Build allowlisted public and
  per-player private projections. A room broadcast must contain public data only.
- Validate inbound and outbound application payloads with Zod at transport
  boundaries. TypeScript annotations alone are not runtime validation.
- Schema validation is not authorization. Check the stable player identity,
  membership, phase, allowed action, bounds, and rate limits before mutation.
- Reconnects must reauthorize the player and produce a fresh recipient-specific
  snapshot. A room code, player ID, or socket ID is not proof of identity.
- Never log secret rules, resume credentials, or raw private payloads.
- Never expose account email, provider tokens, password digests, session tokens,
  verification/reset tokens or the server-private account user ID in room state.

## Implementation discipline

- Keep one mutation path and one authoritative owner per room. Do not introduce
  parallel room managers, game engines, timer owners, or score calculators.
- Keep mini-game rules and results on the server behind one shared lifecycle.
  Client mini-game views only render authorized projections and send intents.
- Use the pinned pnpm version and commit `pnpm-lock.yaml`. All workspace packages
  are private and must remain non-publishable unless explicitly authorized.
- Keep real environment files out of Git. Anything prefixed `NEXT_PUBLIC_` is
  public and must never contain a secret.
- Apply committed Prisma migrations with `prisma migrate deploy`; never reset or
  use schema-push against production data.
- Prefer existing tools and Node built-ins. No new dependency, infrastructure,
  networking framework, or service without a concrete need in the approved phase.
- Use strict TypeScript; do not hide errors with `any`, blanket suppressions, or
  disabled checks. Preserve the separation of browser and Node types.
- After important changes run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
  Also run `pnpm build` when application, dependency, or build configuration changes.
- Add meaningful tests for changed behavior. In later phases, include privacy,
  malicious payload, reconnect, duplicate action, timer, and synchronization tests.
- Report commands run, failures, and any checks that could not run. Never claim
  a check passed without executing it.

## Architecture references

- `docs/ARCHITECTURE.md`: boundaries, deployment shape, and shared mini-game plan.
- `docs/MULTIPLAYER.md`: authority, privacy, validation, synchronization, reconnects.
- `docs/AUTHENTICATION.md`: Better Auth boundary, account flows, security and deployment.
- `docs/GAME_DESIGN.md`: product concept and open design decisions.
- `docs/DESIGN_SYSTEM.md`: visual identity, tokens, presentation contracts, accessibility.
- `docs/PHASE_0_6.md`: isolated homepage interactions, sound/preferences, verification.
- `docs/PHASE_1.md`: current rooms/lobby handoff, verification and four-window testing.
- `docs/SECRET_RULE_ENGINE.md`: shared rule generation, privacy and evaluator architecture.
- `docs/BUTTON_GAME.md`: current Button V2 cards, challenge lifecycle, timers and privacy behavior.
- `docs/HOW_TO_PLAY_VIDEO.md`: production blueprint and privacy rules for the planned tutorial video.
- `docs/SCORING.md`: match-local point configuration, reveal timing, ties and reset.
- `docs/BUTTON_MAYHEM.md`: retired mode note; it is not a playable or reserved Button V2 system.
- `docs/ROADMAP.md`: explicitly gated future phases.
