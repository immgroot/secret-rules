# SECRET RULES — Game Design

## Product concept

SECRET RULES is a commercial online browser party game for **4–10 players**.
Everyone faces one legible public challenge while each active player privately
receives a different objective or modifier. Those incentives intersect, conflict
and make reasonable people behave suspiciously. The social game is arguing,
bluffing, persuading and deciding who to trust with incomplete information.

The visual language is the approved dark tabletop, warm paper, cream type, lime
and lavender accents, condensed display lettering and restrained physical motion.
The Button itself is red; red does not replace lime as the product accent.

## The Button

The first playable mini-game has one public objective:

> GET THE COUNTER TO EXACTLY 20.

The real round starts at 0. The host chooses a 60, 80, 120 or 180 second preset,
or a custom 30–300 second round time, before play; 80 seconds is the default. A
normal accepted press adds 1. Exactly 20 succeeds and locks immediately; more
than 20 fails as an overshoot; time expiring below 20 fails. The homepage teaser
that starts at 12 is a separate local script and does not define room gameplay.

The server assigns from 49 Button-specific mechanics. They cover personal press
counts, first/final actors, target counts, immediate sequence, multi-player press
patterns, value goals/avoidance, parity, before/after conditions, broad
cooperation, sabotage and three controlled hidden modifiers. Normal rounds favor
intersecting, understandable motives rather than unrelated counts.

Current hidden mechanics are:

- **DOUBLE:** the owner's next valid press adds 2.
- **BLOCK:** the target's next press is accepted but changes the counter by 0.
- **PROTECT:** the owner's next press cannot be neutralized by BLOCK.

The table sees the resulting counter movement but not its private cause. The
reveal supplies the explanation after the argument has had time to happen.

A successful input starts a short shared recharge, and the last accepted actor
must wait for another player to press before acting again. This pacing is
authoritative server state. It creates turn-taking pressure without prescribing
a fixed order and keeps every sequence rule achievable under the core mechanic.

## Public and private success

The group result and personal rule result are separate. A group can miss 20 while
a player completes an exact press count; the group can hit 20 while the final
actor violates another player's objective. Phase 3.3 preserves match-local additive
points: 3 for a successful Secret Rule, 1 to every participant for public success,
and 1 for a successful Hard rule. An explicitly eligible Wild rule adds 2. There
are no penalties, XP, coins, ranked ladders, battle passes or persistent scores.

Progress semantics include permanent completion, permanent failure, still
possible and currently satisfied. “Make Milo press last” can become satisfied and
unsatisfied during play; “avoid 13” fails permanently once 13 appears. Only the
owner receives live progress.

## Player experience

The lobby ends when the host deliberately starts after all 4–10 active players
ready. Players see private physical cards and acknowledge them; spectators only
see reading/ready status. A synchronized 3–2–1–GO leads into one shared tabletop.

Desktop seats distribute around the perimeter of one wide oval table according
to player count. The target, mechanical counter and physical Button are integrated
into the table's center instead of floating as separate cards. Mobile turns the
same table into a compact vertical surface with a wrapping roster rather than
shrinking an unreadable ellipse. Stable colors, names, connection/AFK labels and
short seat reactions identify actors without relying on color alone.

Chat is collapsed by default and opens as an overlay drawer with an unread count;
the table never shifts when it opens. The secret becomes a small hold/toggle
control. Mouse, touch and keyboard can activate the Button.
Keyboard R reveals the secret only when focus is not in an input. Reduced-motion
preferences remove nonessential movement and sound remains optional.

## Chaos setting

- **Chill** emphasizes simpler cooperative/personal combinations and makes
  modifiers uncommon.
- **Normal** balances conflicts, values, sequences, targets and occasional
  modifiers.
- **Chaos** increases sabotage, competing finales, conditional rules and hidden
  modifiers, while the same hard validation and quality search keep sets playable.

History penalizes repeating a player's recent family, identity, category and
target. Continuing generates a new round without changing room identity, player
identity, color, seat ownership, chat, host or reconnect credential.

After every safe reveal, players see personal point breakdowns and party-game
standings. Equal totals share a rank. On the final configured round, all players
with the highest total are named as tied winners. The host can then return the
same room to the lobby with scores and game state reset.

## Button modes

**Classic** is the current playable Button: target 20, counter 0, normal +1,
global recharge, no same actor twice in a row, Secret Rules, overshoot and timeout.

**Mayhem** is a future separate mode intended for limited Action Tokens, stronger
secret actions and server-generated public events. Its exact balancing and rules
are not approved. Phase 3.3 preserves its reserved types only; it cannot
be selected or started. See [BUTTON_MAYHEM.md](./BUTTON_MAYHEM.md).

## Current and excluded games

| Name | Status |
| --- | --- |
| The Button — Classic | Phase 3.3 playable match |
| The Button — Mayhem | Design foundation only; not playable |
| The Elevator | Named only; not authorized |
| The Bomb | Named only; not authorized |

Doors, Safe, Train, Auction, Bridge, Maze and every other mini-game are also out
of scope. Voice, speech analysis, public matchmaking, accounts, payments,
persistent progression and rematch/stay-together are not implemented.

## Playtest questions

- Which objectives create arguments without feeling arbitrary?
- Which timer presets work best for 4, 6 and 10 players?
- How often should a Normal round contain a hidden modifier?
- Are BLOCK and PROTECT understandable after reveal?
- Do players check private progress too often or too little?
- Is the public feed enough to reconstruct weird moments without exposing causes?
- Which families are routinely impossible after a departure and need different semantics?
