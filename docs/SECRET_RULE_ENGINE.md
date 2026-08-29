# Secret Rule Engine — Phase 2

## Scope

Phase 2 established the reusable rule catalog, assignment pipeline, private state
boundary, development inspector and simulation harness. Phase 3 preserves that
engine and adds the first mini-game RulePack: 49 Button-specific families with
real evaluator behavior. The Elevator, The Bomb and all other games remain out of scope.

## Three state boundaries

| Boundary | Contents | Delivery |
| --- | --- | --- |
| Public round | Round ID/number, mini-game ID, reveal phase, public objective, public timer/game placeholders, public actions/events, acknowledgement/presence | Validated `PublicRoomSnapshot.publicRound` to current room members |
| Private player round | Exactly one player's `SecretRule`, private knowledge, hidden ability presentation data, server-owned progress, private target and acknowledgement | Validated `round:privateState` to that player's currently authorized socket only |
| Server-only round | Every assignment, cryptographic generation seed, relationship graph, validation/quality metadata and history | Never serialized wholesale |

The public projection is an allowlist. The private projection is a second
allowlist selected from the socket's stable, credential-authorized player binding.
It has no target-player input. Host status does not change the selection. A
spectator fails the private-player gate and receives no private event.

## Structured rules and templates

`packages/shared/src/rules.ts` defines the browser-safe schemas for generated
rules and recipient-specific state. A `SecretRule` carries a template ID,
structured identity, mini-game/category/rarity/difficulty, validated parameters,
authorized target IDs, machine-readable relationship tags, presentation copy,
progress type, reward weight, private visibility and evaluator ID. Runtime logic
must never parse the description to decide an outcome.

The server-only catalog contains **100 distinct base families** in 14 categories:

| Category | Families |
| --- | ---: |
| Personal | 10 |
| Target | 10 |
| Avoidance | 8 |
| Timing | 8 |
| Sequence | 8 |
| Cooperation | 8 |
| Sabotage | 8 |
| Protection | 6 |
| Social | 8 |
| Prediction | 5 |
| Private knowledge | 5 |
| Hidden ability | 6 |
| Conditional | 6 |
| Wild | 4 |

Each compiled `RuleTemplate` declares supported mini-games, required capabilities,
a template-specific parameter schema, weight, rarity, difficulty, target selector,
conflict/compatibility/incompatibility tags, relationship capabilities, progress
model, parameter generation, validation, description builders and evaluator
contract methods. `CORE RULES` and `CHAOS PACK` are the initial `RulePack`s.

Selectors are `SELF`, `RANDOM_OTHER`, `HOST`, `PLAYER_LEFT`, `PLAYER_RIGHT`,
`RANDOM_PAIR`, and `ALL_ACTIVE_PLAYERS`. The engine's input list contains active
players only, so spectators cannot be selected.

## Parameterization and concrete variety

Parameters are strict structured fields for action count, public value, threshold,
time threshold, sequence position, direction, condition, action, option, event,
outcome and hidden ability. Current discrete parameter spaces produce these real
catalog estimates before adding mini-game-specific packs:

| Active players | Concrete variants |
| ---: | ---: |
| 4 | 494 |
| 6 | 770 |
| 8 | 1,086 |
| 10 | 1,442 |

The estimate sums each template's actual target-selector space and declared
parameter domains. It does not multiply wording changes or count descriptions as
new templates.

## Assignment pipeline

`generateRuleSet()` performs one bounded server-side pipeline:

1. Validate 4–10 unique active identities and read mini-game capabilities.
2. Filter impossible templates and apply chill/normal/chaos category weights.
3. Read bounded recent per-player history and target-load history.
4. Build a relationship plan, select unique families, resolve fair targets, and
   generate structured parameters from deterministic seeded RNG.
5. Validate each rule, structured identities, capabilities, targets, group
   composition, relationship tags and hard incompatibility metadata.
6. Build the server-only relationship graph, score diversity/fairness/relationships
   and penalize repetition, category clumps and target piles.
7. Compare 24 candidates. If none is valid, use the verified safe composition;
   if that is invalid, fail closed instead of delivering partial rules.
8. Store one private projection per player and append bounded history.

The relationship graph supports `CONFLICTS_WITH`, `SUPPORTS`, `DEPENDS_ON`,
`BLOCKS`, `PROTECTS`, `TARGETS`, `COMPETES_WITH`, and `NEUTRAL`. Reusable tags
such as `require:value:13` and `avoid:value:13` produce direct conflict edges.
Hard incompatibility tags are separate because fun cross-player conflict is not
the same as an impossible self-contradiction.

Chill favors personal, cooperative and protective rules with very few wild rules.
Normal balances categories and seeds understandable conflicts. Chaos increases
sabotage, conditional, hidden ability and wild selection while retaining group
validation and category diversity.

## Randomness, history, and reconnects

Production preparation creates a cryptographically random seed on the server.
The generator derives its deterministic stream from seed + round number +
mini-game ID + candidate attempt. No network input contains a seed. Tests and the
development inspector may inject a seed to reproduce a set.

History stores only bounded structured entries per stable player ID. It penalizes
recent family, identity, category and target repetition. Socket IDs never appear
in the assignment identity. Reconnect reauthorizes the room credential, binds a
new socket, and sends the stored private projection; it does not regenerate.
Removal/expiry invalidates authority. Leaving during reveal aborts prepared rules.

## Evaluators, progress, and The Button

`RuleEvaluatorRegistry` is the one evaluator lifecycle. Mini-games send
typed observable events (`PLAYER_ACTION`, `PUBLIC_VALUE_CHANGED`,
`PLAYER_SELECTED_OPTION`, `TIMER_THRESHOLD`, `SEQUENCE_CHANGED`, `ROUND_EVENT`,
`ABILITY_USED`, `PUBLIC_STATE_CHANGED`) to registered evaluators. Evaluators own
progress/success/failure decisions on the server. The Button registers one
evaluator for each of its 49 distinct families and updates private states from the
authoritative press/value history. Status can be `still_possible`,
`currently_satisfied`, `completed` or `failed`; hidden ability state derives from
server-owned remaining uses.

Shared schemas define the sanitized reveal. RoomOwner creates it only after the
server enters `reveal`; active secrets and every other player's live progress stay
absent from public state before that transition.

## Button-specific pack

`apps/server/src/games/button/catalog.ts` is separate from the 100-family generic
catalog but uses the same `RuleTemplate`, `RulePack`, generator, capability,
targeting, history, relationship and quality contracts. Generation for
`the-button` selects only Button-compatible templates. Normal and Chaos generation
deliberately seed some shared-value conflicts such as REACH 13 versus AVOID 13.

The working hidden mechanics are DOUBLE, BLOCK and PROTECT. Modifier ownership
and cause remain server/private; the public action records only the final 0/1/2
delta. See [BUTTON_GAME.md](./BUTTON_GAME.md).

## Development tools

The inspector and simulator refuse production execution:

```sh
pnpm rules:inspect -- --players=6 --chaos=normal --seed=my-seed
pnpm rules:simulate
```

The inspector prints sample assignments only from explicit development mock
players. It never reads live rooms. The simulator runs 1,200 sets by default
(100 for each 4/6/8/10-player and chill/normal/chaos combination) and reports
real duplicates, invalid sets, fallbacks, category distributions and timings.

For the browser flow, create a room, join at least three more active players,
ready every active player, then use **START GAME** as host. Each player must
inspect and acknowledge their own card. A spectator sees only public preparation,
gameplay and the final sanitized reveal.
