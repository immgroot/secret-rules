# Roadmap and Phase Gates

**Phase 3.3 is the current approved handoff. Do not begin Phase 4.** Completing a
phase never authorizes the next one.

## Completed

### Phase 0 — Foundation

Next.js/React web, Node/Socket.IO server and browser-safe shared package; strict
TypeScript, Tailwind, Zod, ESLint, safe env examples, lockfile and engineering docs.

### Phase 0.5 — Visual identity

Original branding, local fonts, design tokens, physical-card components and the
approved dark tabletop visual system.

### Phase 0.6 — Homepage polish

Tutorial, card inspection, preferences/sound and the isolated local Button teaser.
The teaser remains separate from multiplayer gameplay.

### Phase 1 / 1.6 — Rooms, lobby and social systems

Authoritative room codes, create/join, stable anonymous sessions, reconnect,
readiness, host settings, colors, spectators, AFK, chat, mute/report/profile,
password/lock, removal/transfer, rate limits and multi-client tests.

### Phase 2 — Secret Rule Engine

100 generic families, structured schemas, target selectors, capabilities,
relationship graph, incompatibilities, chaos weighting, quality search,
anti-repetition, deterministic tools and recipient-only private delivery.

### Phase 3 — Game shell and The Button

- reusable in-game shell with 4–10 seating, HUD, chat, secret drawer, event feed,
  connection state, spectator view and reveal;
- explicit server lifecycle from host start through deal, acknowledgement,
  countdown, play, resolution, reveal, next round and minimal match completion;
- 49 Button-specific mechanics connected to the Phase 2 evaluator registry;
- authoritative counter, initial fixed timer, action history, duplicate/rate control,
  exact-20 success, overshoot and timeout;
- working DOUBLE, BLOCK and PROTECT hidden modifiers with sanitized public effects;
- reconnect-stable rule/progress, private evaluation and public final reveal;
- unit and real Socket.IO coverage for privacy, malicious payloads,
  synchronization, reconnect, spectators, modifiers and 4–10 generation.

See [BUTTON_GAME.md](./BUTTON_GAME.md) for the exact current mechanics.

### Phase 3.1 — Gameplay UX and Button pacing

- redesigned rule reading, countdown and active tabletop presentation;
- count-aware 4–10 player seats and responsive mobile roster;
- large mechanical counter and physical Button with explicit availability,
  pressed, recharge, waiting, disabled and round-over states;
- overlay chat with local unread state and no table-width shift;
- server-owned global recharge and previous-actor restriction;
- reconnect-safe recipient-specific private delivery and synchronized state;
- rule-catalog cleanup so every sequence objective remains achievable under the
  new core pacing rule.

### Phase 3.2 — Scoring, match completion and mode foundation

- centralized additive Secret Rule, public challenge, difficulty and explicitly
  eligible Wild scoring;
- reveal-safe public round breakdowns, tied standings and authoritative winners;
- automatic final-round `match_complete` transition with no host dead end;
- host-only next round, reveal-boundary host transfer and safe return to lobby;
- match reset that preserves room, members, host, settings and chat;
- explicit playable Classic mode plus non-playable Mayhem types/configuration;
- focused counter/target hierarchy, player-seat, timer and score presentation
  polish without replacing the approved Phase 3.1 tabletop.

See [SCORING.md](./SCORING.md) and [BUTTON_MAYHEM.md](./BUTTON_MAYHEM.md).

### Phase 3.3 — Premium table and configurable timer (current)

- one reusable physical `GameTable` with wide oval desktop geometry, mobile
  adaptation, subtle SECRET RULES identity and table-depth details;
- dynamic 4–10 perimeter seats, centered Button console, mechanical counter,
  compact table log, collapsed overlay chat and unchanged private Secret access;
- host-only lobby timer presets of 60/80/120/180 seconds plus a whole custom
  30–300 second value, defaulting to 80;
- one server-owned deadline reused for every round, synchronized to all clients,
  with browser-only `mm:ss` presentation and strict rejection of forged timing;
- preserved scoring, match completion, Classic gameplay and non-playable Mayhem
  boundary, with no new dependency or competing state/timer system.

## Not authorized

### Phase 4 — Playtest response and balancing

Requires explicit instruction after manual testing. Possible work includes timing,
weights, copy clarity, modifier frequency, layout refinements and rule semantics.
None is automatically approved by this roadmap.

### Additional mini-games

The Elevator, The Bomb, Doors, Safe, Train, Auction, Bridge, Maze and every other
game require separate approval and must use the existing shell/lifecycle.

### Production and commercial systems

Hosting, persistence, multi-process ownership, accounts, authentication,
matchmaking, a public room browser, durable moderation, payments, achievements,
ranked play, voice and persistent progression are separate architectural phases.
They are not implied by completing The Button.
