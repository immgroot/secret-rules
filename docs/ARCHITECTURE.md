# SECRET RULES — Architecture

## Current system

Phase 3.3 preserves the complete room, Secret Rule, Classic Button, scoring and
match loop while upgrading its table presentation and adding a configurable
authoritative round timer. The system
is one pnpm workspace with three deliberately separated packages:

```text
apps/web                  Next.js rendering and local presentation state
apps/server               Node, Socket.IO, RoomOwner, games and server-only rules
packages/shared           Browser-safe Zod contracts and inferred TypeScript types
```

The homepage demo under `apps/web/src/components/home/demo` is an isolated local
teaser. It is not imported by room gameplay and never acts as network state.

## Ownership

`RoomOwner` is the only authoritative owner of a room. It owns stable player
identity, membership, readiness, stateVersion, the current server round, Button
counter/history, deadlines, hidden modifier causes, private progress, match
scores, standings, winner calculation and result resolution. Socket.IO validates
and routes commands but does not create a second
room or game manager.

The server projects this state across two allowlists:

- `PublicRoomSnapshot` contains room members, chat, the public phase, Button
  result, reveal-safe score breakdown and sanitized reveal. It never contains
  active secrets or private progress.
- `PrivatePlayerRoundState` contains exactly the authenticated recipient's rule,
  target, ability and progress. It travels only on `round:privateState` to that
  player's current credential-authorized socket.

The browser renders newer validated snapshots and sends intentions such as
`game:start`, `round:acknowledgeRule`, `button:press`, `round:continue` and
`match:returnToLobby`. It does not submit a counter, delta, phase, deadline,
result, score, rank, winner or progress value.

## Reusable game shell

`apps/web/src/components/game/GameShell` owns the stable in-game frame and
`GameTable` owns its reusable physical table, perimeter seating and table-log
slots:

- compact round/timer HUD and game menu;
- responsive 4–10 player seating with stable room colors;
- collapsible synchronized chat with local unread/mute behavior;
- recipient-only secret access and private progress;
- public action feed, connection/AFK state, spectator presentation and reveal.
- reveal-safe round breakdowns, standings and match-complete presentation.

The central Button console is the only mini-game-specific surface. The table is
a wide oval physical object on desktop and a compact vertical table on mobile.
Its player seats derive from the current 4–10 public participants, while the
center child can later be replaced by another approved mini-game surface. Chat
opens over the table instead of changing its geometry. A future game must reuse
this shell/table lifecycle and projections; it must not copy the shell, create
another realtime transport or introduce a competing room manager.

## Server mini-game boundary

`apps/server/src/games/button` contains the Button RulePack, evaluator adapter,
typed action history, explicit Classic mode compatibility and modifier resolution.
`apps/server/src/scoring` contains centralized additive scoring and pure
rank/winner calculation. Both are called only by RoomOwner's single mutation
path. The generic generator in `apps/server/src/rules` filters
templates by mini-game and capabilities, while history and relationship scoring
remain shared.

The authoritative lifecycle is:

```text
LOBBY
  → WAITING_FOR_RULE_ACK
  → COUNTDOWN
  → PLAYING
  → RESOLVING
  ├→ REVEAL → host NEXT ROUND → WAITING_FOR_RULE_ACK
  └→ MATCH_COMPLETE (automatically after the configured final round)
       └→ host RETURN TO LOBBY → LOBBY
```

`preparing_round`, `dealing_rules` and `round_complete` remain named protocol
phases for future observable transitions. Preparation and dealing currently run
atomically before `waiting_for_rule_ack`, so clients cannot observe a partial set.

## Configurable Button timer

`RoomSettings.buttonRoundDurationSeconds` is a shared strict Zod field. Its
default is 80, presets are 60/80/120/180, and the accepted whole-second range is
30–300. Only the host may update the complete settings object, and RoomOwner's
existing lobby-only mutation gate rejects every settings change after a match
starts. Round preparation snapshots the selected value into the private
authoritative server round so every round in the match uses the same setting.

At the end of the shared countdown, RoomOwner calculates one absolute deadline,
publishes only `deadlineAt`, `durationMs`, and a `serverNow` sample, and resolves
expiry in its own sweep. The browser formats `mm:ss` and visual tension from
those values; it cannot submit a duration, deadline, remaining time, or expiry.

## Runtime and deployment

The web and server are separate processes. Shared schemas compile before both.
Development defaults to web port 3000 and realtime port 3001; the verified local
preview may run web on 3100 with the same server. The server is intentionally
in-memory and single-process. Restarting it loses rooms.

Production deployment still requires explicit hosts/origins, TLS, trusted-proxy
review, monitoring, load/failure testing and a scaling design that preserves one
owner per room. Phase 3.3 scores are match-local and in-memory; it adds no
database, account system, payment service or
external infrastructure.

## Dependency direction

```text
apps/web ───────┐
                ├──> packages/shared
apps/server ────┘
```

The web never imports server code. Shared never imports either app and never
stores rule catalogs, server seeds, credentials, relationship graphs or internal
modifier explanations.

## Button modes

Shared contracts name `CLASSIC` and `MAYHEM`. Classic is the only playable mode
and every current Button template opts into it. Mayhem has reserved action/event
identifiers and non-playable server configuration only; there are no transport
handlers or client controls for it. See [BUTTON_MAYHEM.md](./BUTTON_MAYHEM.md).
