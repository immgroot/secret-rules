# Multiplayer — Phase 3.3

## Authority and synchronization

One synchronous `RoomOwner` mutation path owns every room and Button round. The
client renders validated full snapshots and sends intentions. A Button request
contains only `requestId` and `roomId`; strict Zod parsing rejects extra fields,
including forged counter, delta, completion, score or secret progress.

Every accepted public mutation increments `stateVersion`. Clients accept only a
newer snapshot for their credential's room that still contains their stable
player ID. Full snapshots make skipped versions safe. Reconnect and explicit
resync build a fresh public projection plus the recipient's current private state.

## Current lifecycle

The host may send `game:start` only from the lobby when there are 4–10 connected
active players and all are ready. Spectators do not count. Preparation generates
one complete set atomically, enters `waiting_for_rule_ack`, and privately fans out
cards. Public statuses expose only connected and acknowledged.

When every active round participant acknowledges, the server publishes a shared
countdown deadline. On expiry it enters `playing`, publishes one absolute server
deadline using the match's selected Button duration, and unlocks presses. Exactly
20, an overshoot, or timeout immediately
locks actions and enters `resolving`. After a short server-owned result moment it
publishes a sanitized reveal and authoritative score breakdown. On non-final
rounds the current host may continue. The final reveal atomically becomes
`match_complete`; it does not wait for another client command.

Clients never choose a phase or run an independent authoritative timer.

## Timer setting and authority

`room:updateSettings` carries the full strict settings object, including
`buttonRoundDurationSeconds`. Presets are 60, 80, 120 and 180 seconds; custom
whole-second values may be 30–300; the default is 80. Runtime validation rejects
fractions, out-of-range values, missing authority fields and extra fields. The
current stable host is the only caller authorized to update it, and settings are
lobby-only. An active-match update fails with `GAME_ALREADY_STARTED`.

RoomOwner snapshots the configured seconds at round preparation. When the
countdown expires, it creates `deadlineAt` from its own clock and publishes the
same `durationMs` and deadline to every authorized member and spectator. The
browser may interpolate the display between snapshots, but only the server sweep
can create a timeout or round result. A forged press carrying `durationMs`,
`deadlineAt`, or another timing field fails strict payload validation.

## Events

Client to server:

```text
room:create              room:join                 session:resume
room:leave               room:requestState         player:setReady
room:updateSettings      room:setVisibility        room:setLock
room:setPassword         room:setName              room:kickPlayer
room:transferHost        player:setAvatar          player:setColor
player:randomizeAvatar   player:setRole            player:activity
chat:send                player:report             game:start
round:acknowledgeRule    button:press              round:continue
match:returnToLobby
```

Server to client:

```text
room:update              round:privateState        session:ended
server:error
```

All commands use strict shared schemas and request IDs. RoomOwner stores a
bounded hash journal per player. Retrying an identical request ID returns current
state without replaying the mutation; reusing it for different content fails.

## Button validation and rate control

For each `button:press`, the server checks:

1. the socket is the current binding for a stable room member;
2. the member is connected and an active player, not a spectator;
3. the room and round are in `playing` and input is unlocked;
4. the actor was not responsible for the previous accepted normal press;
5. the shared server recharge deadline has elapsed;
6. transport limits permit the action;
7. the request ID has not already applied a different action.

The server then resolves BLOCK/PROTECT/DOUBLE, calculates a 0/1/2 delta, appends
typed internal history, updates every private evaluator, creates sanitized public
actions, checks the target, and broadcasts one new snapshot. Once resolution
starts no later packet can move 20 to 21.

Every accepted press sets one room-wide 850 ms recharge deadline. The public
projection exposes the deadline and previous actor ID so clients can explain the
current control state, but only RoomOwner may accept or reject the next press.
Rejected recharge and repeat attempts do not mutate the counter, consume hidden
abilities or advance `stateVersion`.

## Privacy

The public projection exposes what happened: actor, previous/current counter,
delta, sequence and time. It never carries the server-only modifier cause or any
private rule/progress. `round:privateState` has no target-player parameter and is
sent only after stable credential authorization to the player's current socket.
Host status grants no additional secret access.

Spectators receive public challenge, seats, chat, timer, counter, action feed,
result and final reveal. They receive no private event, secret control, progress
or pre-reveal ability information, and server-side press/ack attempts fail.

The reveal is a new public allowlist created only at the reveal-safe transition
to `reveal` or final `match_complete`.
It includes sanitized rule wording, final status and selected relationship types;
it does not serialize the server round, generation seed, raw modifier journal or
relationship reasons.

Match score totals are public, but the current round's score and breakdown stay
unchanged through `playing` and `resolving`. Rule status, points and updated
standings appear together only at `reveal` or `match_complete`. All clients and
spectators receive the same allowlisted score projection. No score component can
be supplied by a client.

## Match completion and host control

`round:continue` is valid only for the current stable host during a non-final
`reveal`. Host transfer is permitted in the lobby or at reveal-safe boundaries;
authorization changes immediately to the new host. On the configured final
round, RoomOwner publishes `matchResult`, tied or single winner IDs and final
standings while entering `match_complete` automatically.

`match:returnToLobby` is host-only and valid only from `match_complete`. It
preserves room identity, players, current host, settings and chat, while clearing
scores, round counters, rule history, private assignments, ready state and Button
state. Connected players receive an explicit null private delivery.

## Reconnects, departures and moderation

Player identity uses a UUID plus a room-scoped 32-byte bearer token whose SHA-256
hash is stored server-side. Socket IDs are replaceable transport bindings. A
credential-authorized replacement revokes the prior socket, restores the same
seat/color/rule/progress, and gets a fresh recipient-specific snapshot.

Disconnects remain seated for the existing 60-second grace. During rule reading,
an unacknowledged disconnected player keeps the table waiting for reconnect. If
the grace expires or the player explicitly leaves, their public round status is
made non-blocking; their existing assignment remains safe for final evaluation
and reveal, and evaluators resolve impossible target outcomes without crashing.

Host removal controls are disabled after gameplay starts. Profile, local mute,
private report and room chat remain available. Explicit leave removes authority;
a later press from the old socket/session fails.

## Transport limits

Socket.IO uses exact allowed origins, protocol version 7, a 4 KiB packet limit,
strict known event names, bounded connection/event windows, limited chat/report
history and periodic cleanup. These in-memory limits protect the game protocol;
they are not production DDoS protection.
