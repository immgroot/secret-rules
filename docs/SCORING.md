# Button V2 Scoring

Scoring is match-local, in memory and owned only by the server.

| Event | Winner / recipient | Other side |
| --- | ---: | ---: |
| Correctly Call Bluff | +1 challenger | -1 bluffer |
| False accusation | +1 truthful player | -1 challenger |
| Land exactly on target | +2 landing player | +1 every other active player |
| Complete Standard Secret | +3 | — |
| Complete Hard Secret | +5 | — |
| Fail Secret | 0 | — |

Every negative challenge change uses a score floor of zero. There is no negative
Secret score. Challenge and target changes may be shown live because their cause
is public. Secret points and completion are added only during authoritative round
resolution and published with the final breakdown.

Each round entry reports challenge points, challenge penalties, target reward,
Secret difficulty/result/reward, signed round total and nonnegative match total.
Standings use competition ranking, so equal totals share a rank and the following
rank skips. Equal top totals produce tied winners.

The host can continue after a non-final reveal. The configured final reveal
becomes `match_complete`. Return to lobby clears every score and ledger while
preserving room membership, host, settings and chat.
