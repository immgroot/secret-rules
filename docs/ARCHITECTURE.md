# Architecture

SECRET RULES is a pnpm workspace with three private packages:

```text
apps/web        Next.js/React presentation and intention sending
apps/server     Node.js/Socket.IO transport and authoritative RoomOwner
packages/shared Browser-safe Zod schemas and inferred TypeScript types
```

The web app never imports server code. The shared package never contains the
server rule catalog, deck order, random seeds, credentials, full RoomState or
another player's private data.

## One authoritative owner

`RoomOwner` is the only mutation owner for rooms, membership, match state and
Button V2. Its synchronous transitions make first-challenger and duplicate
request races atomic. Server-only `RoomState` contains stable players, credential
hashes, request journals, one `ServerButtonRound`, the shuffled deck, private
assignments, effect state, vote identities, Secret events and score ledgers.

No full RoomState is serialized. `publicSnapshot()` constructs an allowlisted
public projection and validates it. `privateProjection()` is built for one
authenticated, connected active player and sent directly to that socket. Host
status grants no extra private access. Spectators have no private projection.

## Button V2 modules

```text
packages/shared/src/button-v2.ts       card/settings helpers
packages/shared/src/lobby.ts           strict commands and Socket.IO events
packages/shared/src/rules.ts           public/private round projections
apps/server/src/games/button/deck.ts    composition, scaling and seeded shuffle
apps/server/src/games/button/engine.ts  pure movement and safety rules
apps/server/src/games/button/catalog.ts V2 Secret templates
apps/server/src/games/button/evaluator.ts structured Secret evaluation
apps/server/src/scoring/                live/final authoritative score logic
apps/server/src/rooms/room-owner.ts     lifecycle and single mutation path
```

Cards are private objects identified by server-created UUIDs. The public claim is
a separate value. Shared Zod validation checks shape; RoomOwner separately checks
identity, membership, ownership, active turn, phase, deadline and target.

## Synchronization

Every important mutation commits one increasing public `stateVersion`. Clients
ignore stale public snapshots. Private deliveries have their own increasing
`revision`; the client ignores same-round deliveries at or below its current
revision. Reconnect reauthorizes the stable player credential, revokes an older
socket, and produces fresh recipient-specific state.

Timers are deadlines in server state. Browser clocks only render remaining time.
The sweep advances countdown, turn timeout, challenge timeout, reveal pause,
vote timeout and Last Chance start. Server random sources own shuffle, STEAL,
INSPECT and tied-vote coin flips.

## Client-relative table projection

`apps/web/src/components/game/seat-projection.ts` rotates only the render order
around the authenticated stable player ID. Each active player is assigned the
front/bottom visual seat on their own device while the other original
`PublicPlayer` objects are distributed around the perimeter. The authoritative
player array, current player ID, direction, skip markers, challenge identities,
and targeted player IDs are never rewritten. Target controls continue sending
the selected `PublicPlayer.playerId`.

Spectators have no player seat and therefore use the unchanged logical order in
a neutral orientation. A reconnect derives the same point of view again from
the stable room player ID; visual seat position is never stored or broadcast.
The mobile layout separates the local front seat from a wrapped opponent rail
outside the table while retaining the server-owned direction indicator.

## Deployment shape

Web and server deploy separately from the repository root/workspace graph so the
shared package can build first. The browser receives only
`NEXT_PUBLIC_REALTIME_URL`. The server uses exact `ALLOWED_ORIGINS`, Railway's
`PORT`, and a cloud-safe `HOST` such as `0.0.0.0`. Rooms remain in one server
process; horizontal scaling requires a separately approved ownership/adapter
design.

## Future mini-games

New mini-games must reuse the room/session/reconnect system, public/private
projection boundary, shared schemas, request journals, lifecycle shell and one
authoritative owner. Documentation is not permission to implement another game.
