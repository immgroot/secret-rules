# Multiplayer Protocol

Protocol version 12 uses Socket.IO transport with strict Zod payload validation.
The server accepts intentions only; payload validation never replaces membership,
identity, phase, ownership, deadline and rate-limit authorization.

## Optional account identity at handshake

Before connecting, an authenticated browser may request a short-lived account
JWT from the same-origin Better Auth route. The Socket.IO handshake carries that
JWT as `accountToken`; it never carries a client-supplied user ID. The realtime
server verifies Ed25519 signature, issuer, audience, expiry and subject against
the configured JWKS endpoint before accepting the socket. Invalid presented
tokens are rejected; an absent token remains a valid guest connection.

The verified account subject is server-private. Creating or joining can associate
it with the player record; a reconnect that presents a different authenticated
account cannot take over that seat. The high-entropy room credential remains the
proof required to resume, including for an authenticated account. A matching
account does not grant host status, membership, turn authority, or access to any
private projection. Account email and provider data never enter room state.

## Button V2 command events

| Event | Intention |
| --- | --- |
| `game:start` | Host starts after 4–10 connected active players are ready |
| `round:acknowledgeRule` | Owner confirms receipt of their private Secret |
| `button:playCard` | Current player submits either an owned Number ID plus Number claim, or an owned Effect ID plus its one real target/WILD movement when required |
| `button:callBluff` | Eligible opponent attempts the first challenge |
| `button:passChallenge` | Eligible opponent irrevocably passes on the current Number claim |
| `button:penaltyDiscard` | Punished player chooses one owned remaining card |
| `button:targetVote` | Active player privately chooses END or CONTINUE |
| `button:basicAction` | Current empty-hand player requests safety +1 |
| `round:continue` | Host creates the next fresh round after reveal |
| `match:returnToLobby` | Host resets completed match state while preserving the room |

Every command includes a UUID request ID and room ID. Request journals return the
same result for an identical replay and reject reuse with different content.
Only one synchronous RoomOwner transition may accept a challenge response or vote.
Actions received at or beyond authoritative deadlines are rejected.

The pending Number play owns a server-only set of passed stable player IDs. Public
state projects only those IDs for compact PASSED/THINKING feedback. A passed
player cannot later challenge. The final eligible pass calls the existing
no-challenge resolution synchronously; the first accepted Call Bluff locks all
later responses. A duplicate pass is an idempotent no-op. Timer expiry stays the
fallback for unanswered and temporarily disconnected eligible seats.

## State projections

All members receive the same versioned public snapshot: room/lobby state and the
allowlisted Button V2 projection. It contains current turn/phase, server deadline,
counter/target, direction, public card counts, face-down claim, public claim
for Number Cards, reveal-safe challenge, face-up direct Effect/target results,
challenge pass IDs, shield/skip markers, vote totals, public scores and final reveal.

An active player separately receives only their own private state:

- five-card hand and subsequent private hand mutations;
- their Secret Rule, with completion masked until reveal;
- their own Inspect knowledge;
- their own stolen-card receipt knowledge;
- their pending penalty or target-vote choice;
- independent monotonically increasing private revision.

Unchallenged actual Numbers, shuffled order, STEAL/penalty identities, other hands,
other Secrets, other vote choices, relationship graph, random seed, resume token,
password digest and report details never enter a public broadcast. CSS is not a
privacy boundary.

## Reconnect

Player identity is a room-scoped player ID plus a high-entropy bearer token, not
the Socket.IO ID. A valid reconnect replaces the previous socket, restores the
same room member and sends fresh public and recipient-private state. It supports
turn, challenge, challenge reveal, penalty discard, target vote, Last Chance and
reveal. Direct Effects have no durable intermediate choice phase: target or WILD
movement is part of the validated play intention. A room code or player ID alone
proves nothing.

The browser rejects stale public `stateVersion` values and stale same-round
private `revision` values. It never buffers gameplay intentions while offline.

An account-authenticated reconnect still uses this exact flow. If a JWT has
expired, the browser obtains another short-lived token before the next socket
handshake; the account JWT is not stored in localStorage or sessionStorage.

## Lifecycle and departures

Temporary disconnect keeps a seat for the grace period. Permanent departure is
recorded in the current server round so turn order, acknowledgement, challenge
all-pass eligibility, pending choice, target vote and Last Chance cannot deadlock. A departing penalty choice
receives a server fallback only after membership is permanently removed;
temporary disconnect remains recoverable through the original private choice.

If permanent leaves or expired reconnect reservations reduce an active match to
fewer than two active players, `RoomOwner` abandons the match before another
timer transition can score it. Abandonment clears the round, hands, Secrets,
Inspect knowledge, match scores and rule history, sends null private deliveries
to connected survivors, resets ready/AFK state, and returns the room to the
lobby with the public `match_abandoned` notice. It never creates a winner or
awards challenge, target, or Secret points. Empty rooms still follow the normal
destruction and idle cleanup paths.

Return to lobby preserves code, members, host, settings and chat. It clears
scores, rounds, deck/discard, hands, Secrets, Inspect knowledge, effects, votes,
ready state and other temporary match state.
