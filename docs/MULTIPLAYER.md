# Multiplayer Protocol

Protocol version 8 uses Socket.IO transport with strict Zod payload validation.
The server accepts intentions only; payload validation never replaces membership,
identity, phase, ownership, deadline and rate-limit authorization.

## Button V2 command events

| Event | Intention |
| --- | --- |
| `game:start` | Host starts after 4–10 connected active players are ready |
| `round:acknowledgeRule` | Owner confirms receipt of their private Secret |
| `button:playCard` | Current player supplies owned card ID, public claim and required public target |
| `button:callBluff` | Eligible opponent attempts the first challenge |
| `button:penaltyDiscard` | Punished player chooses one owned remaining card |
| `button:wildChoice` | Wild owner chooses +1, +2, -1 or -2 |
| `button:targetVote` | Active player privately chooses END or CONTINUE |
| `button:basicAction` | Current empty-hand player requests safety +1 |
| `round:continue` | Host creates the next fresh round after reveal |
| `match:returnToLobby` | Host resets completed match state while preserving the room |

Every command includes a UUID request ID and room ID. Request journals return the
same result for an identical replay and reject reuse with different content.
Only one synchronous RoomOwner transition may accept the first challenge or vote.
Actions received at or beyond authoritative deadlines are rejected.

## State projections

All members receive the same versioned public snapshot: room/lobby state and the
allowlisted Button V2 projection. It contains current turn/phase, server deadline,
counter/target, direction, public card counts, face-down claim, public claim
target, reveal-safe challenge, effect results, shield/skip markers, vote totals,
public scores and final reveal.

An active player separately receives only their own private state:

- five-card hand and subsequent private hand mutations;
- their Secret Rule, with completion masked until reveal;
- their own Inspect knowledge;
- their pending penalty, Wild or target-vote choice;
- independent monotonically increasing private revision.

Unchallenged actual cards, shuffled order, STEAL/penalty identities, other hands,
other Secrets, other vote choices, relationship graph, random seed, resume token,
password digest and report details never enter a public broadcast. CSS is not a
privacy boundary.

## Reconnect

Player identity is a room-scoped player ID plus a high-entropy bearer token, not
the Socket.IO ID. A valid reconnect replaces the previous socket, restores the
same room member and sends fresh public and recipient-private state. It supports
turn, challenge, challenge reveal, penalty discard, Wild choice, target vote,
Last Chance and reveal. A room code or player ID alone proves nothing.

The browser rejects stale public `stateVersion` values and stale same-round
private `revision` values. It never buffers gameplay intentions while offline.

## Lifecycle and departures

Temporary disconnect keeps a seat for the grace period. Permanent departure is
recorded in the current server round so turn order, acknowledgement, pending
choice, target vote and Last Chance cannot deadlock. A departing penalty/Wild
choice receives a server fallback only after membership is permanently removed;
temporary disconnect remains recoverable through the original private choice.

Return to lobby preserves code, members, host, settings and chat. It clears
scores, rounds, deck/discard, hands, Secrets, Inspect knowledge, effects, votes,
ready state and other temporary match state.
