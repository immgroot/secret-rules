# Roadmap and Phase Gates

**Button V2 is the current approved handoff. Do not begin another phase without
explicit instruction.** Completing this work does not authorize deployment or a
second mini-game.

## Completed foundation

- pnpm workspace with Next.js/React web, Node/Socket.IO server, strict shared
  Zod contracts, TypeScript, Tailwind and ESLint;
- original visual identity, local fonts, accessible components, preferences and
  isolated homepage teaching interactions;
- authoritative room codes, lobby settings, stable anonymous reconnect,
  readiness, host controls, colors, spectators, AFK, chat, mute/report,
  passwords/locks, removal/transfer, rate limits and integration tests;
- bounded Secret Rule Engine with generic catalog, target relationships,
  incompatibilities, Chaos weighting, quality search and anti-repeat history;
- match-local scoring, reveals, standings, final winners and safe return to lobby.

## Button V2 — current

- scaled server-shuffled deck and five recipient-private cards per player;
- independent private revisions and reconnect restoration;
- turn action with real-card ownership and unrestricted public claim identity;
- first accepted Call Bluff, card reveal only on challenge, score floor and
  loser-selected private penalty discard;
- +1/+2/+3/-1/-2, SKIP, STEAL, INSPECT, REVERSE, SHIELD and WILD;
- deck exhaustion and empty-hand Basic Button safety;
- configurable exact target, authoritative target rewards, private vote,
  seeded tied-vote coin flip and exactly one Last Chance rotation;
- 22 Button V2 Secrets with Standard/Hard rewards and hidden live completion;
- V2 lobby settings, premium outside-edge seating, private hand/claim flow,
  challenge/effect presentation, reveal breakdown and responsive composition;
- isolated V2 homepage demo, eight-step How to Play and missing-video fallback.

## Not authorized

- balancing or tuning changes beyond defects found in this implementation;
- The Elevator, The Bomb, Doors, Safe, Train, Auction, Bridge or another game;
- Classic/Mayhem, Action Tokens, old recharge/repeat behavior or hidden modifiers;
- database, multi-process room ownership, accounts, authentication, payments,
  matchmaking, public room browser, durable moderation, voice, achievements,
  ranked play or persistent progression;
- deployment or merging this branch into `main`.
