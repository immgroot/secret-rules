# Phase 1 — Realtime Rooms and Synchronized Lobby

## Implemented scope

The approved homepage now opens real create/join forms with validated names and
four existing avatar styles. A server-generated five-character code leads to a
live lobby; `/join/CODE` prefills the invite form. Copy code/link, server-owned
player list, readiness, host settings, reconnect presentation, explicit leave and
full resync work. START GAME stays disabled for everyone. Branding, layout,
public example cards and the isolated Phase 0.6 demo were preserved.

No actual secret assignments, rule generation, score, round state machine,
mini-game, database, account, payment, matchmaking, text/voice chat or spectator
system was implemented. Room credentials exist only for anonymous reconnects.

## Files added in this phase

| Area | Files |
| --- | --- |
| Shared contracts | `packages/shared/src/lobby.ts`, `errors.ts` |
| Server | `apps/server/src/rooms/room-owner.ts`, `src/realtime/transport.ts`, `src/realtime/rate-limiter.ts` |
| Server tests | `apps/server/test/multiplayer.test.ts`, `room-owner.test.ts` |
| Web transport/store | `apps/web/src/multiplayer/client.ts`, `state.ts`, `session.ts`, `provider.tsx` |
| Web composition/routes | `apps/web/src/app/providers.tsx`, `app/join/[code]/page.tsx`, `app/room/[code]/page.tsx` |
| Lobby UI | `apps/web/src/components/lobby/room-entry.tsx`, `lobby-page.tsx`, `apps/web/src/styles/lobby.css` |
| Web tests | `apps/web/test/lobby.test.ts` |
| Handoff | `docs/PHASE_1.md` |

Updated shared exports; server bootstrap/config/env example/package/foundation
tests; web layout/global styles/home/tutorial/settings/RoomCode/avatar type,
presentation tests and test TypeScript module resolution; lockfile; AGENTS,
README, architecture, multiplayer, game design, design system and roadmap.
The Phase 0.6 handoff is now labeled historical.

The existing socket.io-client 4.8.3 is newly declared as a server devDependency
for real integration clients. No new unique dependency or version was added.
The offline install reused cached packages; no new networking/test framework.

## Authority, sessions and security

One synchronous RoomOwner owns each in-memory RoomState. Each committed public
change advances stateVersion and sends a strict, allowlisted public snapshot to
connected members only. The browser never decides host, player counts, readiness
or settings. Older snapshots and foreign room/member snapshots are ignored.

The server issues stable UUID player IDs and random 32-byte room-scoped bearer
credentials. Only the caller receives its token; the authoritative player stores
its hash. The client saves only its own credential in per-tab sessionStorage,
not the roster/settings. Refresh resumes that identity; a new socket replaces the
old binding. A same-token second tab takes over and ends the previous transport.

Disconnect reserves the seat for 60 seconds after detection. It retains ready,
name/avatar and host role. Expiry or explicit leave removes membership. Host
transfer chooses the earliest connected surviving member; if none is connected,
there is no host until an eligible member returns/joins. Empty and inactive rooms
are reclaimed. Server restart deliberately loses all rooms.

Strict Zod schemas, exact origin checks, membership/role/phase validation,
request IDs, bounded deduplication and rate limits reject malicious or stale
requests. Payloads above 4 KiB close the transport. Public snapshots contain no
tokens, hashes, socket IDs or journals. UI text is escaped; names use a restricted
Unicode/punctuation allowlist. No client-supplied host flag/player authority is
trusted. See [MULTIPLAYER.md](./MULTIPLAYER.md) for exact contracts and limits.

## Network events

Client commands: `room:create`, `room:join`, `session:resume`, `room:leave`,
`player:setReady`, `room:updateSettings`, `room:requestState`.

Server messages: `room:update`, `session:ended`, `server:error`.
Create/join/resume use validated private acknowledgments, not a public grant event.

## Automated verification

Commands executed successfully:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

**45 tests passed: 18 server, 27 web.** The server suite includes ten real
Socket.IO integration scenarios on ephemeral TCP ports and four lifecycle/limiter
unit tests, in addition to four configuration/HTTP checks. Web tests include five
new lobby/session/schema tests plus the existing presentation/interaction tests.

Coverage includes:

- A/B/C/D identical rosters, B ready, host round count 7, C disconnect/resume with
  the same playerId/readiness and fresh settings; public payload privacy checks.
- Nearly simultaneous ready changes; old duplicate retries cannot resurrect an
  earlier ready value; conflicting request reuse and rapid spam are rejected.
- Malformed/HTML names, extra authority fields, fake host/foreign-player actions,
  unauthorized snapshots and incorrect credentials.
- Four-player reserved capacity, ten-player maximum, rejected eleventh player,
  unique credentials and settings reductions below occupied seats.
- Temporary host retention, timed expiry, deterministic host transfer, explicit
  leave/revocation, empty/idle room cleanup and no eligible connected successor.
- Reconnect takeover revokes the stale socket before another snapshot; no duplicate seat.
- Duplicate create/join/leave acknowledgments and stale commands for a previous room.
- Polling and WebSocket origin/handshake checks, unknown/prototype event names and
  oversized packets; bounded room/limiter retention.
- Client stale-version filtering, safe session storage and session/grant consistency.

## Browser verification

Development and built-production app were exercised with four independent browser
tabs: GROOT, ESTRIX, MILO and JUNE. Verified create/join/avatar selection, matching
rosters, ready synchronization, round count 7 and chaos updates, guest-disabled
settings, refresh recovery, code/link copy feedback, explicit leave and immediate
host transfer. START GAME remained disabled.

Lobby overflow/controls were measured at 1920×1080, 1440×900, 1366×768, 768×1024,
430×932, 390×844 and 320×740 CSS pixels. The create modal fits at 320px; the invite
form and a 20-character player name fit at 390px. Invalid code/name and duplicate
name errors were checked in the browser. Reduced motion produced no row animation.

A controlled Node outage preserved the last roster, displayed CONNECTION LOST /
RECONNECTING and disabled mutations. Restart behavior is checked separately from
seat recovery: a new process has no old rooms; existing credentials were rejected
cleanly with a visible rejoin message. This does not claim a physical Wi-Fi/device test.

Production create/join/sync/settings/refresh flows had no console warnings/errors
before the deliberate outage. Failed network requests during an intentional outage
are expected. One development browser error mentioning an undefined animation
was seen during the earlier SVG-navigation disconnect probe; it did not reproduce
in the production flows. Full native keyboard/screen-reader, cross-browser,
real-device/network and load testing remain manual release work, not completed QA.

Evidence is in ignored `.local/qa/phase-1`, including the production desktop lobby,
mobile create form, responsive measurements and reconnecting screenshot.

## Exact four-window manual test

### Start

1. Install Node 24.19.0 (or newer Node 24) and pnpm 11.19.0 on PATH.
2. If the handoff preview is already running, use port 3100 and skip starting
   another server. Otherwise, in this repository run
   `pnpm install --frozen-lockfile`, then `pnpm dev` (port 3000).
3. Open four **independent new** browser windows with Ctrl+N. Type
   `http://127.0.0.1:3000` into each. Do not use Duplicate Tab or copy browser
   session storage. A normal window plus an incognito window/profile is fine;
   per-tab sessionStorage also allows all four in one normal browser profile.
4. Use the same origin in all four windows. Do not mix localhost and 127.0.0.1.
   For the already-running production preview, use port 3100 in all four instead.

### Create and synchronize

1. **Window 1:** CREATE ROOM → name GROOT → lime avatar → CREATE ROOM.
   GROOT must show YOU and HOST. Note the generated code; click COPY CODE.
2. **Window 2:** JOIN ROOM → paste that code → name ESTRIX → violet → JOIN ROOM.
3. **Window 3:** paste the COPY LINK invite address from Window 1 into the address
   bar. It must prefill the code. Enter MILO → coral → JOIN ROOM.
4. **Window 4:** JOIN ROOM → same code → JUNE → blue → JOIN ROOM.
5. All four show GROOT/ESTRIX/MILO/JUNE, 4/10, exactly one HOST and their own YOU.
6. Window 2 presses I'M READY. Every window must show ESTRIX READY.
7. Window 1 changes ROUND COUNT to 7, CHAOS to CHAOS and MAX PLAYERS to 4.
   All four must show identical values. Guest settings must be disabled.
8. In Windows 2/3/4, toggle ready nearly together and quickly repeat. Each result
   must converge to the server snapshot; controls may briefly show UPDATING.
9. Use RESYNC in a connected window. It must retain the latest roster/settings.
   START GAME must remain disabled, regardless of count or readiness.

### Refresh and temporary disconnect

1. Mark MILO ready in Window 3, then refresh that window. It must return as MILO
   with YOU, the same avatar/readiness, and round count 7; no fifth seat appears.
2. To test one disconnected client, keep Window 3 open and use its browser
   DevTools Network Offline setting **with existing WebSocket disconnection**.
   Some browsers only block new requests: if presence does not change, use a
   separate device/network or temporarily navigate that tab to another page.
   Do not stop the Node server for this test; restarting loses the room.
3. Remaining windows must show MILO RECONNECTING after transport detection, still
   occupying a seat. A separate fifth attempt must receive ROOM FULL at max 4.
4. Restore the connection within 60 seconds of detection (or go Back in the same
   tab if you navigated away). MILO must return to the same seat and current settings.
5. Local network loss with the lobby open should display the reconnect overlay;
   mutation controls stay disabled until the server-authorized resume finishes.

### Host grace, explicit leave and cleanup

1. Temporarily disconnect Window 1. HOST must remain GROOT during grace; nobody
   else gains host controls. Restore it before expiry to keep the role.
2. Disconnect Window 1 again for over 60 seconds **after detection** (allow a few
   additional seconds for heartbeat/cleanup). ESTRIX, the earliest connected
   surviving player, becomes the only HOST. GROOT's old resume must be rejected.
3. Window 2 chooses LEAVE ROOM and confirms. It returns home immediately; MILO
   becomes HOST. ESTRIX's old seat is gone without a grace reservation.
4. Leave with MILO and JUNE. The final leave destroys the room. Joining the old
   invite must show ROOM NOT FOUND. Joining again after an explicit leave always
   creates a new player identity, not restoration of the old one.
5. Separately, stop/restart Node with a room open. Expect the reconnect overlay,
   then a clear expired/invalid-session message; no process-restart persistence.

## Known limits and handoff

SessionStorage survives refresh but not reliably a closed tab/browser session;
keep the tab open during reconnect tests. Storage denial warns that refresh may
lose the seat. Credentials are bearer secrets: TLS and XSS prevention remain
necessary for public hosting. Read-only inspection of another room is not exposed.

Rate limits are MVP fixed windows on direct remote IP and do not protect against
distributed attacks. One process owns at most 500 rooms; no persistence or scaling.
No claim of a production security audit, physical Wi-Fi QA or full accessibility
certification is made. `in_game`/GAME_ALREADY_STARTED are reserved for later phases.

The first offline dependency install needed permission to access the existing
pnpm cache and then succeeded. A Windows pnpm `exec next` preview launch did not
resolve its binary; running the already-installed Next binary through Node worked.
These were tooling issues, not remaining build failures. Final checks passed.

**STOP. Do not implement secret rules or gameplay without explicit approval.**
