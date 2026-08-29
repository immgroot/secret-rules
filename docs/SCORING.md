# Match Scoring — Phase 3.2

## Authoritative formula

`apps/server/src/scoring/config.ts` is the single source of point values:

| Component | Points |
| --- | ---: |
| Successful Secret Rule | 3 |
| Successful public challenge | 1 to every round participant |
| Easy difficulty bonus | 0 |
| Medium difficulty bonus | 0 |
| Hard difficulty bonus | 1 |
| Explicitly eligible Wild bonus | 2 |

All values are additive. Failed rules, public failure, bad presses, overshoots and
timeouts have no penalty. A Wild rule earns the Wild bonus only when its
server-only template explicitly opts in; rarity alone never awards points.

## Timing and privacy

RoomOwner finalizes private evaluator results during `resolving`, but the public
score arrays remain unchanged and `roundScore` remains null. At the reveal-safe
transition the server calculates each breakdown, updates match totals, ranks the
standings and publishes rule results and points in the same versioned snapshot.
The client cannot submit points, success, bonuses, totals, rank or winners.

## Standings and winners

Standings sort by descending total. Equal totals receive the same rank, with the
next rank skipped (`1, 1, 3`). Every player sharing the highest final total is a
winner; join order and client presentation order never break a tie.

Scores last only for the current in-memory match. Host-authorized return to lobby
clears totals, rounds, private assignments, rule history and Button state while
preserving the room, members, host, settings and chat.
