# The Button — Phase 3.3

**Classic is the only playable Button mode.** Its public mechanics remain
unchanged from Phase 3.1. Mayhem is a non-playable design/type foundation; see
[BUTTON_MAYHEM.md](./BUTTON_MAYHEM.md).

## Public challenge

**GET THE COUNTER TO EXACTLY 20.** The authoritative counter starts at 0. A
normal accepted press adds 1. The round uses the host's locked lobby duration.

The host selects the round duration in the lobby: 60, 80, 120 or 180 seconds,
or a whole custom value from 30 through 300 seconds. The default is 80. Once the
match starts the setting is locked and every round uses that selected value.

- 20: success; input locks before another press can apply.
- Above 20: overshoot failure; input locks immediately.
- Timer reaches zero below 20: timeout failure; the current counter freezes.

The homepage demo starts at 12 and is local teaching choreography. It shares no
state or game code with this round.

## State machine

```text
lobby
  └─ host game:start
       └─ waiting_for_rule_ack
            └─ every participant acknowledged
                 └─ countdown (server deadline)
                      └─ playing (server deadline)
                           └─ resolving (success / overshoot / timeout)
                                ├─ reveal
                                │    └─ host next Button round
                                └─ match_complete (automatic on final round)
                                     └─ host return to lobby
```

Preparation and card delivery are atomic. The protocol reserves
`preparing_round`, `dealing_rules` and `round_complete` for later observable
presentation steps, but no client sees a half-generated assignment set.

## Press resolution

`button:press` is a strict `{ requestId, roomId }` intention. RoomOwner validates
the current socket binding, stable member, active role, connection, phase,
previous accepted actor, global recharge deadline and request journal. The
client cannot submit a counter, delta, score,
modifier, completion or private progress value.

For an accepted action, the server:

1. resolves any relevant BLOCK/PROTECT/DOUBLE uses;
2. creates an internal record with actor, previous/current values, delta,
   timestamp, sequence and server-only modifier causes;
3. emits typed observable events to the Button evaluators;
4. updates every private assignment in server memory;
5. appends allowlisted `PLAYER_PRESSED` and `COUNTER_CHANGED` public actions;
6. checks exact target/overshoot and broadcasts a new versioned snapshot.

Request IDs make a retransmitted physical press idempotent. Each accepted press
starts one room-wide 850 ms recharge. The accepted actor then remains locked out
until a different active player completes a press. Both rules are enforced before
modifier consumption or counter mutation; wider transport/IP windows limit
packet floods.

## Event model

The Button engine represents press request/accept/resolution, player press,
counter change/value reach, final actor, modifier application, target,
overshoot and timeout through typed server code and Phase 2 observable events.
The retained public feed is deliberately narrower: it reports the actor and
visible value result, never the hidden reason.

Public example:

```text
MILO PRESSED
14 → 16  (+2)
```

Server/private cause until reveal:

```text
Milo consumed DOUBLE
```

## Rule pack

The pack contains **49 distinct Button mechanics**, not copy variants. Families
cover:

- exact/minimum/maximum/no personal presses;
- first, final and first-plus-final actor;
- target first/final/count/absence/responsibility;
- immediate follow, prohibited follow, pair ordering and legal three-actor patterns;
- reach/avoid/own a value, parity, before/after/crossing conditions;
- distinct/every player participation and paired cooperation;
- DOUBLE, BLOCK and PROTECT hidden mechanics.

Structured parameters provide counts, values and stable player targets. Values
are drawn from relevant pre-target counters; targets are active players only.
Generation uses the shared 24-candidate quality search, relationship graph,
chaos weights and per-player history. Recent template/category/identity/target
repetition is penalized.

The Phase 3.1 pacing audit replaced objectives that required or merely prohibited
same-player consecutive presses. The replacements require `owner → target →
owner`, a target between two different actors, or three unique actors in a row,
so all 49 mechanics remain meaningful under the core turn restriction.

## Modifiers

- **DOUBLE** consumes on the owner's next unblocked valid press and produces +2.
- **BLOCK** consumes when its private target next presses and produces +0.
- **PROTECT** consumes on the owner's next press and allows the normal (or
  doubled) result through an otherwise active BLOCK. The BLOCK also consumes.

Chill's general category weights make hidden abilities uncommon, Normal allows
them occasionally, and Chaos gives them more weight. At most one Secret Rule is
assigned per player, and template families are unique within a generated round.

## Evaluation

Evaluators read authoritative observable history. They never parse display copy.
Examples:

- exact press count reports current/target and permanently fails above target;
- avoid value permanently fails once the counter hits that value;
- reach value completes when it occurs;
- target-final is `currently_satisfied` while that target is latest and changes
  if another player presses;
- abilities report READY, USED or UNUSED from server-owned uses.

Only the owner receives live progress. Group success and private success remain
separate. Match-local points appear only with the safe public reveal.

## Scoring and standings

The server awards 3 points for Secret Rule success, 1 point to every participant
for public challenge success, and a 1-point Hard bonus. Easy and Medium currently
add zero. A 2-point Wild bonus applies only to templates explicitly marked
eligible; rarity never awards it by itself. Failures and overshoots subtract
nothing. Values live in one scoring configuration.

During `playing` and `resolving`, public scores retain their previous-round values
and `roundScore` remains null. Reveal publishes the score breakdown, standings
and Secret Rule result atomically. Tied totals share rank. After the configured
final round, the server enters `match_complete` and supplies every top-scoring
winner; the client never chooses a winner.

Non-final reveals accept a host-only `NEXT ROUND`. Final completion instead
offers host-only return to lobby, which preserves the room, members, host,
settings and chat while clearing readiness, scores, round/rule state and Button
state. See [SCORING.md](./SCORING.md).

## Gameplay presentation

The active screen is one premium physical table: count-aware seats surround a
wide oval tabletop with layered housing, recessed surface, fasteners and a subtle
lime edge. The target, mechanical split-digit counter, status lights and large red
Button are integrated into its center. The compact table log sits on the surface;
chat opens over it without moving the table. Mobile preserves the same hierarchy
in a vertical table adaptation. The timer adds restrained urgency below 15 and
5 seconds. The Button derives AVAILABLE,
PRESSED, RECHARGING, WAITING, DISABLED and ROUND OVER labels from authoritative
public state. Chat is collapsed by default and opens over the table; it does not
resize the game. Rule reading uses one deliberate reveal and acknowledgement,
followed by a compact waiting state and a shared 3–2–1–GO countdown. A dismissible
first-round primer explains exactly 20, normal +1, turn-taking and secret rules.

## Timer and stateVersion

Countdown and play use absolute server deadlines and a `serverNow` sample. The
selected lobby duration is snapshotted into the authoritative server round and
published as milliseconds only after play starts. The browser formats `mm:ss`
and interpolates presentation only; RoomOwner performs the transitions in
its periodic sweep. Each transition/action increments the room `stateVersion`.
The browser discards stale snapshots, so an older counter cannot overwrite a
newer one.

## Reconnects and departures

Assignments attach to stable player UUIDs, not sockets. Reconnect restores the
same color, seat, Secret Rule, ability uses and progress on a new authorized
socket. Disconnect keeps the seat during the grace period.

If rule reading loses a player, the table waits for the grace window. Expiry or
explicit leave marks that participant non-blocking for acknowledgement while
preserving the already-generated rule for safe final evaluation. A departed
target can make an objective fail at resolution; it cannot crash an evaluator.
Mid-game host kick is disabled; explicit leave is still supported.

## Spectators and privacy

Spectators see the challenge, seats, counter, timer, public chat/feed, group
result and final reveal. They receive no private card/progress/ability and cannot
acknowledge or press. Server-side checks enforce this even for handcrafted
packets.

Before reveal, the public projection never contains rule content, evaluator IDs,
progress, hidden ability ownership or server-only modifier explanations. Reveal
entries are rebuilt from a narrow schema and include only display name, rule
wording, final status and progress summary. Relationship highlights omit internal
reason tags.

## Balancing seams

The default round setting is 80 seconds and the lobby allows 30–300. The server
constants retain a 3-second countdown, a 1.2-second resolution beat and an 850 ms
global recharge. RoomOwner accepts test-only constructor overrides so automated
tests do not wait in real time. Future balancing may tune constants and pack
weights, but changing settings during a match remains intentionally unsupported.
