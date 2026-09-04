# Secret Rule Engine

The server-only Secret Rule Engine retains the bounded candidate search,
capability filtering, parameter validation, target selection, relationship graph,
hard incompatibility checks, quality scoring, deterministic test seeds and
per-player anti-repeat history established in Phase 2.

## Button V2 pack

The playable game selects only the 22 templates in
`apps/server/src/games/button/catalog.ts`. They cover successful bluffing,
correct challenges, false accusations, truthful resolution, positive/negative
Number cards, direct targeted effects, distinct Number claims, effect variety and player-specific
social goals. Standard templates use medium difficulty and pay 3 points; Hard
templates use hard difficulty and pay 5.

Generation receives a server-computed balance context:

- scaled deck size and exact card-kind counts;
- target value;
- expected turns per player;
- active player identities and relationship target availability;
- configured Secret Intensity weighting (`chill`, `normal`, `chaos`) and recent rule history.

Threshold generators clamp goals to expected opportunity. Target selectors use
active players only and never select the owner. Candidate validation rejects
missing parameters, impossible thresholds, unsupported capabilities, duplicates,
hard incompatibilities and immediate recent repeats. A bounded, validated V2
fallback exists if candidate search cannot produce a full set.

All 22 Button templates were audited for the split. Bluff, truth and challenge
templates consume Number outcomes only. Effect templates count direct resolved
Effects and real targets; none requires an Effect claim, Effect bluff or fake
target. Because Effects occupy only about 20% of scaled decks, the two Effect
goals remain low-count and lower-weight while Number/social goals dominate.

## Evaluation and privacy

RoomOwner records structured `BUTTON_V2_OUTCOME` events after authoritative
Number challenge or direct-Effect resolution. The evaluator never consumes a client claim that
has not first passed ownership/phase validation and server resolution. It updates
server-private progress after relevant events and performs final evaluation after
`ROUND_RESOLVED`.

The owner may receive their Secret during the round, but the delivery projection
masks completion status, current count and target until round reveal. Other
players and spectators never receive that Secret or progress. Public reveal is
built from allowlisted descriptions, final status and summary; generation seeds,
catalog metadata and relationship internals remain server-only except selected
reveal-safe relationship highlights.

## Generic architecture

The existing generic catalog and simulation tools remain development
infrastructure for future approved mini-games. They are not mixed into the
Button V2 playable pool. A future mini-game must provide its own capability set,
pack and evaluator while reusing the same generator and privacy boundary.
