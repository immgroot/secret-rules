# The Button V2

The Button V2 is the only playable mini-game. It is a 4–10 player hidden-card
bluffing game implemented inside the existing authoritative `RoomOwner`.

## Round sequence

```text
RULE_ACK → COUNTDOWN → TURN_ACTION
                         ├─ Number → face-down claim → CHALLENGE
                         │                            ├─ timer/all opponents PASS → real Number resolves
                         │                            └─ challenge → reveal → optional PENALTY_DISCARD
                         └─ Effect → face-up direct resolution

card resolution → next TURN_ACTION
exact target → TARGET_VOTE
              ├─ END → ROUND_REVEAL / MATCH_COMPLETE
              └─ CONTINUE → exactly one LAST_CHANCE rotation → reveal
```

The server chooses the starting player and initial clockwise direction. Turn and
challenge deadlines are server timestamps. No animation delays server mutation.

## Deck and hands

The locked 50-card standard composition is:

| Card | Count | Resolution |
| --- | ---: | --- |
| +1 | 12 | Button +1 |
| +2 | 10 | Button +2 |
| +3 | 7 | Button +3 |
| -1 | 6 | Button -1, floor 0 |
| -2 | 5 | Button -2, floor 0 |
| SKIP | 2 | Target skips next legitimate turn; Button +1 |
| STEAL | 2 | Random private card transfers from target; Button +1 |
| INSPECT | 2 | Random target card is privately shown to inspector; Button +1 |
| REVERSE | 2 | Reverse turn direction; Button +1 |
| SHIELD | 1 | Block next hostile targeted effect; Button +1 |
| WILD | 1 | Direct choice of +1, +2, -1 or -2; no extra +1 |

Quick, Standard, Long and Epic decks scale proportionally for the active player
count. Custom decks accept 30–200 cards and must contain at least five cards per
player plus ten. A seeded largest-remainder calculation preserves the standard
distribution and seeded server shuffle makes tests reproducible.

Each active player receives five cards through a direct private delivery.
Spectators receive no hand. A normal resolved/cancelled play consumes the played
card and draws one replacement if available. A challenge loser chooses one
additional private discard; that loss is never refilled. Empty deck does not end
the round. A player with no cards receives the server-approved Basic Button +1
safety action.

## Number claims and challenges

Only Number Cards enter the bluff system. The client sends an owned Number card
ID and one of the five Number identities as its claim. The server looks up the
real card and rejects Effect cards submitted through this path. The Number lands
face-down; public state contains the actor and claim, never the real Number.
Players may claim a Number they do not own. Number Cards never target players.

During the challenge window, each eligible opponent may CALL BLUFF or PASS. PASS
is an authoritative, synchronized decision for that one claim and permanently
locks that player out of challenging it. The first accepted CALL BLUFF closes the
window. If every eligible opponent has passed, the server resolves immediately
without waiting for the deadline. Partial pass decisions leave the existing
timer running; no response at expiry means trust. A reconnect-reserved player
remains eligible until the timer, while permanent departure removes that player
from the all-pass calculation. An unchallenged card stays hidden and its real effect
resolves. If actual and claim differ, the bluff is caught: the card is revealed,
its effect is cancelled, challenger gains 1, bluffer loses 1 with score floor 0,
and the bluffer chooses an extra discard. If they match, the false accusation is
shown, the truthful card still resolves, the truthful player gains 1, challenger
loses 1 with floor 0, and the challenger chooses the extra discard.

## Direct Effect Cards

INSPECT, STEAL and SKIP accept exactly one eligible stable player ID. REVERSE and
SHIELD accept no target. WILD accepts no player target and includes one movement
choice (`+1`, `+2`, `-1` or `-2`) in the play command. Effects land face-up,
create no claim or challenge window, resolve immediately, consume the card, draw
normally and advance the turn. INSPECT, STEAL, SKIP, REVERSE and SHIELD move the
Button +1 after their effect; WILD applies only its chosen movement.

Effect motion is a client presentation of the already-authoritative public and
recipient-private projections. The face-up card travels to the table, then a
short effect-specific cue explains target focus, transfer, skip, direction,
shield, or WILD movement. Public STEAL remains face-down in transit. Only the
thief or inspector receives the actual card identity in private state. Reduced
motion removes large travel/flip cues while preserving result text and markers.

The turn deadline remains active until a complete direct command arrives. If a
player never supplies the required target or WILD value, the server times out
the turn without consuming or auto-playing the card.

## Counter, target and vote

Positive movement that would exceed the target fails and leaves the counter
unchanged. Negative movement floors at zero. Landing exactly on the target locks
the counter for the rest of the round. The landing player gains 2 target points;
every other active player gains 1, once.

Every active player then receives a private END/CONTINUE choice. Public state
contains only submitted/eligible counts and the final result. A majority wins;
an exact tie uses the seeded server random source. CONTINUE schedules one turn
for each active player, respecting direction, skips and departure handling. The
secured counter cannot move during this rotation.

## Privacy and reconnect

Public state contains counter, target, turn, direction, deck/discard counts,
hand counts, shields/skips, a Number claim, public pass decisions for the active
challenge, challenge result when revealed,
face-up Effect and its real target, vote totals/result, public scores and
reveal-safe results. It never contains card IDs, deck order, unchallenged actual
cards, stolen/penalty card identities, Inspect knowledge, Secret assignments,
vote identities or random seeds. The thief receives stolen-card knowledge in
their own private projection; the inspector alone receives Inspect knowledge.

Private state contains only the authenticated player's hand, Secret, masked live
Secret progress, Inspect records and pending choice. Its independent `revision`
lets the browser discard stale deliveries. Reconnect authorization replaces the
old socket and sends a fresh public snapshot plus that player's current private
projection. Secret completion becomes visible only at round reveal.

## Match abandonment

Reconnect reservations remain members for the configured grace period, so a
brief network interruption keeps the same identity, hand, Secret, private
knowledge, and current round. Turn deadlines still advance on the server; a
disconnected player is never auto-played and receives no artificial score.

After explicit leaves or reconnect expiry, fewer than two active players cannot
continue an active match. The server abandons it, clears every round/private and
match-score structure, returns connected survivors to the lobby, and broadcasts
`NOT ENOUGH PLAYERS REMAIN.` This path cannot resolve a round, declare a winner,
complete a Secret, or award challenge/target/Secret points. Empty rooms are
destroyed normally.
