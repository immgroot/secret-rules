# The Button — Mayhem Design Foundation

## Status

**Mayhem is not playable in Phase 3.3.** Classic is the only enabled Button mode.
The shared `ButtonMode` type names `CLASSIC` and `MAYHEM`; server mode
configuration marks Mayhem `playable: false`, and the generator rejects attempts
to start it. Every current Button template is explicitly Classic-compatible.

No Mayhem Socket.IO command, room setting, selector, token mutation, event
resolver or client screen exists. This separation prevents a future mechanic
from entering Classic accidentally.

## Intended future systems

### Action Tokens

Players will have a limited server-owned action resource. A normal Mayhem action
is expected to consume a token, limiting domination by two alternating players.
Token counts, refresh rules and departure behavior are intentionally undecided.

### Secret Actions

Reserved typed concepts are `DOUBLE`, `FREEZE`, `SWAP`, `REPEAT`, `SHIELD` and
`STEAL`. Their names do not grant gameplay behavior. Future designs must define
authorization, targets, costs, conflicts, durations, privacy projections and
reconnect semantics before implementation.

### Public Events

Future events may be selected by the server at counter milestones, time
milestones or server-selected moments. They will be public, temporary changes to
shared rules. No event library, random selection or Classic event hook is active.

## Mode boundary

Rule templates and packs carry Button-mode compatibility. Classic currently has:

- exact target 20, counter 0 and normal +1;
- global recharge and previous-actor restriction;
- the existing private rules and DOUBLE/BLOCK/PROTECT resolution;
- exact-20 success, overshoot failure and timeout failure.

Mayhem will need its own approved rule pack and lifecycle extensions. It must not
modify Classic configuration by conditionals scattered through RoomOwner. The
Elevator is unrelated and remains undesigned and unimplemented.
