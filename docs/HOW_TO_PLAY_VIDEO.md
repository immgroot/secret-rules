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

## Accessibility and delivery checklist

- Captions match the final narration and remain enabled through the HTML `<track>` element.
- Every essential rule appears in narration or captions, not only animated text.
- Text maintains sufficient contrast and stays legible at 360 CSS pixels wide.
- Motion is understandable without rapid flashes; no sequence exceeds common photosensitivity thresholds.
- Export H.264 MP4 with web-optimized metadata and test playback in current Chrome, Safari, Firefox, and Edge.
- Verify the intentional fallback still works if the MP4 is absent or fails to load.
- Do not include room credentials, real player data, production URLs, or unrevealed Secret assignments in captured footage.
