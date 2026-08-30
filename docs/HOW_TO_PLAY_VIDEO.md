# SECRET RULES — How To Play Video Blueprint

## Purpose

This is the production blueprint for a concise 75-second homepage video that teaches a real Button V2 round. It must feel like a premium physical table game, make the 4–10 player online format obvious, and explain the difference between a private real card and a public claim without exposing another player's private data.

The homepage intentionally falls back to the interactive tutorial until the final `/apps/web/public/videos/how-to-play.mp4` is produced. Do not add an empty, generated, or placeholder MP4.

## Production format

- **Runtime:** 75 seconds; acceptable final range is 60–90 seconds.
- **Frame:** 16:9, 1920×1080 master, with essential text inside a central mobile-safe area.
- **Style:** SECRET RULES ink, paper, lime, violet, and red palette; physical felt table; fast card movement; restrained camera motion.
- **Audio:** one clear narrator, subtle table/card sounds, low instrumental bed, no critical information conveyed by sound alone.
- **Captions:** use `apps/web/public/videos/how-to-play.vtt` as the timing and language baseline. Re-time it to the final voice edit if the production cut changes.
- **Privacy rule:** the camera may show the teaching player's example hand and Secret only when explicitly framed as that player's private view. It must never imply every participant receives that private payload.

## Storyboard and voiceover

| Time | Picture / motion | Voiceover | On-screen text |
| --- | --- | --- | --- |
| 00:00–00:05 | SECRET RULES logo stamps onto the felt, then the multiplayer table fades up behind it. | “Everyone is playing the same game. But everyone has a different Secret Rule.” | `SAME GAME. DIFFERENT RULES.` |
| 00:05–00:10 | A host creates a room, shares a short code, and GROOT, NIDA, ALEX, and SAM populate seats around the same synchronized table. | “Get four to ten friends together, create a room, and share the code.” | `4–10 PLAYERS ONLINE · SHARE THE CODE` |
| 00:10–00:15 | Camera moves behind YOU at the front/bottom seat. Five cards fan out in a private tray; opponents see card backs only. | “At the start of each round, everyone gets five private cards.” | `YOUR HAND · ONLY YOU` |
| 00:15–00:20 | A Secret card opens only in YOU's private panel: `SUCCESSFULLY BLUFF 3 TIMES.` Other seats receive no secret text. | “You also get a Secret objective. Only you can see it.” | `YOUR SECRET · KEEP IT QUIET` |
| 00:20–00:25 | YOU privately select the real card `-2`; it moves face-down toward the center. | “On your turn, choose the card you're really playing.” | `REAL CARD: -2 · PRIVATE` |
| 00:25–00:31 | The real card remains concealed while the public claim picker selects `+2`. Center text reads `YOU CLAIM +2`. | “Then tell everyone what you claim you played. Tell the truth... or lie.” | `PUBLIC CLAIM: +2` |
| 00:31–00:36 | Challenge timer circles the card. NIDA hits `CALL BLUFF` first; ALEX and SAM lock out. | “Before time runs out, another player can Call Bluff.” | `NIDA CALLS BLUFF` |
| 00:36–00:43 | The card flips to `-2`. A red `BLUFF CAUGHT` stamp lands. NIDA gets +1, YOU lose 1, and an extra private discard animates only in YOU's tray. | “If they catch your lie, your card is cancelled, they gain a point, and you lose a point and another card.” | `BLUFF CAUGHT · NIDA +1 · YOU -1` |
| 00:43–00:48 | Quick alternate example: YOU plays `+2`, claims `+2`, and gets challenged. The card flips to `FALSE ACCUSATION`. | “But challenge someone who's telling the truth, and you're the one who gets punished.” | `FALSE ACCUSATION` |
| 00:48–00:56 | Fast real-interface montage: STEAL transfers a face-down card; SKIP marks a seat; INSPECT appears only in the inspector's private panel; REVERSE flips direction; SHIELD blocks an attack; WILD opens private movement choices. | “Special cards let you steal, skip, inspect, reverse, protect yourself, or change the Button.” | `STEAL · SKIP · INSPECT · REVERSE · SHIELD · WILD` |
| 00:56–00:62 | Button counter advances 28, 29, 30 against `TARGET 30`; the red physical Button reacts on the exact landing. | “Manipulate the Button and land exactly on the target.” | `TARGET 30 · EXACTLY` |
| 00:62–00:68 | Secret card flips: `SUCCESSFULLY BLUFF 3 TIMES`, `3 / 3`, `COMPLETED`, `+3`. | “Complete your Secret without giving yourself away for bonus points.” | `SECRET COMPLETED · +3` |
| 00:68–00:75 | Match standings rise. Camera pulls back to the table, then resolves to the logo and CREATE ROOM action. | “Bluff. Accuse. Manipulate. Score the most points to win.” | `SECRET RULES` · `SAME GAME. DIFFERENT RULES.` · `CREATE ROOM` |

## Editorial notes

Keep the private/public distinction visible at all times. Private panels should be attached to the `YOU` point of view with a clear lock or “ONLY YOU” label. Public claims, timers, Button movement, challenge results, and reveal-safe standings belong at the center of the shared table.

The 13-scene example uses Nida as the challenger and the prescribed `-2` real card / `+2` public claim so the video, captions, and interactive tutorial tell the same story. Avoid cutting so quickly that the viewer misses which value was real and which was claimed. The interactive tutorial carries the additional target-vote and Last Chance explanation that cannot fit cleanly in this short cut.

## AI production workflow

The tutorial must primarily show the real Button V2 interface. Generative video must not invent gameplay screens, substitute different cards, change player names between shots, or create actions the authoritative app cannot perform.

1. Capture clean 1440p or 1080p footage from the real app. Use a dedicated local room with safe fictional player names and no production credentials.
2. Capture every scene below as a separate take so pacing can change without recreating the interface.
3. Use AI only for voiceover, noise and image cleanup, pacing or edit assistance, transitions, subtitle timing, and optional logo motion for the intro or outro.
4. Keep the real captured interface visible for every gameplay explanation. Do not let generative video replace it with hallucinated UI.
5. Export an H.264 MP4 with web-optimized metadata, a 16:9 frame, and enough bitrate to keep card labels readable.
6. Place the approved file at `apps/web/public/videos/how-to-play.mp4`. Keep `apps/web/public/videos/how-to-play.vtt` synchronized with the final narration.

### Exact capture shot list

Capture these states from the current real UI, in this order:

1. Homepage logo and the create/join room actions.
2. A four-player lobby filling with GROOT, NIDA, ALEX, and SAM, followed by synchronized ready states.
3. The four-player physical oval table with the local player projected at the bottom/front seat.
4. The local five-card private hand; opposing seats show public hand counts only.
5. The local Secret reveal and acknowledgement, framed clearly as private.
6. `YOUR TURN` with the local active ring, turn banner, and connected countdown.
7. Real-card selection on `-2`, including the `REAL CARD · PRIVATE` summary.
8. The full claim-card picker selecting `+2`, followed by the private-real/public-claim confirmation.
9. `PLAY FACE-DOWN`, with the generic SECRET RULES card back moving from the local seat to the center.
10. Public challenge state: `YOU CLAIM +2`, face-down card, countdown, and NIDA selecting `CALL BLUFF`.
11. Challenge reveal: card flip to actual `-2`, `CLAIMED +2`, `ACTUAL -2`, and `BLUFF CAUGHT`.
12. A second truthful example that flips to `+2` and resolves as `FALSE ACCUSATION`.
13. Targeted claim selection for STEAL, showing player buttons backed by stable table identities.
14. Short real-interface effect takes for SKIP, STEAL, INSPECT, REVERSE, SHIELD, and WILD. INSPECT knowledge must appear only in the authorized player's private panel.
15. A no-challenge resolution where the card moves to discard face-down and its identity remains hidden.
16. Button movement reaching the exact target and opening the synchronized private vote.
17. Secret reveal, round score breakdown, standings, and match completion.
18. Final wide table shot, logo, and homepage create-room action.

Also capture one ten-player wide table and one 390×844 mobile take for editorial flexibility. Never capture raw resume credentials, browser storage, server logs, developer tools, unrevealed opponent cards, or another player's Secret.

### Scene-by-scene capture sheet

Use one four-player room throughout: **GROOT** (recording POV), **NIDA**, **MUS**, and **NOOR**. Record GROOT's browser unless the POV column explicitly changes. Preserve the same names, colors, relative seats, room target, and score state across editorially continuous shots. A local deterministic server seed may be introduced only in a separately authorized capture task; never force cards, outcomes, timers, or Secrets from browser state.

| Scene / time | Capture POV and active player | Required authoritative setup | Action and expected visible result | Privacy framing |
| --- | --- | --- | --- | --- |
| 1 · 00:00–00:05 | Homepage / neutral camera | No room | Start on the real logo, then cut to the real table silhouette. | No private data. |
| 2 · 00:05–00:10 | GROOT host browser | GROOT creates; NIDA, MUS, NOOR join by code and ready | Capture the short code share, four synchronized seats, then Start Game. | Crop browser chrome; never show a resume token or storage panel. |
| 3 · 00:10–00:15 | GROOT POV; pre-round | GROOT's server-dealt hand includes `-2`, `+2`, `INSPECT`, `SHIELD`, `WILD` or a visually equivalent five-card teaching hand | Reveal GROOT's five-card tray while opponents show backs/counts. | Label `YOUR HAND · ONLY YOU`; capture no other browser's hand. |
| 4 · 00:15–00:20 | GROOT POV | GROOT receives `SUCCESSFULLY BLUFF 3 TIMES.` | Open and acknowledge the real Secret deal. | Keep the `PRIVATE` / `ONLY YOU` framing in shot. |
| 5 · 00:20–00:25 | GROOT active | Real card `-2` in GROOT's hand | Select `-2`; hold long enough to read `REAL CARD · PRIVATE`. | Center card remains unsubmitted until the next shot. |
| 6 · 00:25–00:31 | GROOT active | Selected real `-2` | Select public claim `+2`, confirm, and play face-down. | Show the private-real/public-claim split; do not flip the card. |
| 7 · 00:31–00:36 | NIDA browser; GROOT remains claimed actor | Challenge timer open on GROOT's `+2` claim | NIDA presses `CALL BLUFF`; other challenge controls lock. | NIDA sees only the public claim and card back. |
| 8 · 00:36–00:43 | Shared table, preferably GROOT POV | Challenge from Scene 7 | Capture actual `-2`, claimed `+2`, `BLUFF CAUGHT`, score delta, then GROOT's private penalty-discard choice. | The penalty card face appears only in GROOT's capture; use a public-table cut for the score. |
| 9 · 00:43–00:48 | NIDA POV; NIDA active | NIDA has real `+2`, claims `+2`; GROOT challenges | Capture `FALSE ACCUSATION`, NIDA +1, GROOT -1, and GROOT's private penalty discard. | The truthful card is public only because the challenge legitimately flips it. |
| 10 · 00:48–00:56 | Use the acting player's POV for private feedback; public POV for consequences | Six separate authoritative takes: STEAL→NIDA, SKIP→MUS, INSPECT→NOOR, REVERSE, SHIELD then hostile target, WILD choice `+2` | STEAL: face-down transfer plus thief-only `CARD STOLEN`; SKIP: mark and consume next turn; INSPECT: inspector-only result; REVERSE: direction changes; SHIELD: `SHIELD BLOCKED IT`; WILD: private choice then exactly +2. | Never composite actual stolen/inspected faces onto the public table. Real targets are selected privately; claim targets are public only when the claim needs one. |
| 11 · 00:56–00:62 | Shared table / active player alternates | Counter begins 28, target 30; legal actions produce 29 then exact 30 | Capture server-synchronized Button movement, target lock, and exact-target response. | Counter and target are public. |
| 12 · 00:62–00:68 | GROOT POV, then reveal-safe shared view | GROOT's Secret progress reaches 3 / 3 | First capture private progress, then the legitimate round reveal with `COMPLETED · +3`. | Do not show completion to the table before reveal-safe phase. |
| 13 · 00:68–00:75 | Shared standings then homepage | Completed match with plausible final scores for all four players | Capture final standings, pull back, cut to logo, tagline, and real `CREATE ROOM` control. | Standings and revealed round results are public. |

For the six-effect montage, record each effect as its own clean take with two seconds of handle before and after the action. Also record: (1) a no-challenge face-down discard, (2) each caught-bluff cancellation with no effect, (3) one 10-player public table, and (4) one 390×844 GROOT POV. This gives the editor enough material to teach the rule without fabricating UI.

## Voice, music, and sound direction

- **Voice:** confident, playful, slightly mysterious, friendly, and quick but understandable. Avoid corporate polish, theatrical menace, or a childish read. Record clean 48 kHz / 24-bit mono before music and processing.
- **Pauses:** leave a deliberate beat before and after `CALL BLUFF`, `BLUFF CAUGHT`, `FALSE ACCUSATION`, and `SECRET COMPLETED`; let the on-screen state land before the next sentence.
- **Music:** subtle mysterious-tabletop rhythm with playful tension. Avoid epic trailer percussion, horror drones, casino swing, and cyberpunk synth leads. Keep the bed at least 12–16 dB beneath narration and duck another 2–4 dB under dense lines.
- **Game sound:** retain real card deal, selection, placement, turn ping, Call Bluff, flip, Button movement, and Secret reveal sounds. Use them as punctuation, never over a consonant-heavy narration phrase. Do not add fake sounds that suggest actions the UI did not perform.
- **Mix:** narration centered and intelligible; music broad but restrained; game effects short and placed to picture. Check the final mix on laptop speakers and headphones.

## Export and poster delivery

Export an H.264 MP4, High Profile, progressive 1920×1080 at the capture frame rate (30 or 60 fps), with AAC-LC stereo audio at 48 kHz / 160–192 kbps. Use a visually inspected web bitrate around 6–10 Mbps for 30 fps or 10–16 Mbps for 60 fps, enable fast-start metadata, and keep card text readable before optimizing file size. The approved deliverables are:

- `apps/web/public/videos/how-to-play.mp4`
- `apps/web/public/videos/how-to-play-poster.webp` (optional 1920×1080 poster, no private card face)
- `apps/web/public/videos/how-to-play.vtt`

The component references the future poster path now. If the poster is absent, the dark premium container and interactive-tutorial fallback still supply the loading/failure presentation. Do not add a fake poster or MP4 merely to make the paths return 200.

## Accessibility and delivery checklist

- Captions match the final narration and remain enabled through the HTML `<track>` element.
- Every essential rule appears in narration or captions, not only animated text.
- Text maintains sufficient contrast and stays legible at 360 CSS pixels wide.
- Motion is understandable without rapid flashes; no sequence exceeds common photosensitivity thresholds.
- Export H.264 MP4 with web-optimized metadata and test playback in current Chrome, Safari, Firefox, and Edge.
- Verify the intentional fallback still works if the MP4 is absent or fails to load.
- Do not include room credentials, real player data, production URLs, or unrevealed Secret assignments in captured footage.
