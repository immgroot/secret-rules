# Phase 0.6 — Interactive Homepage Polish

> Historical Phase 0.6 handoff. Phase 1 now connects Create/Join and adds real lobbies; see [PHASE_1.md](./PHASE_1.md). The scope and results below describe Phase 0.6 only.

## Scope

The approved layout, logo geometry, fonts, dark background, acid-green accent,
and paper-card language are preserved. This phase adds local presentation only.
The new hero identity line is **SAME GAME. DIFFERENT RULES.**

No dependency or package version changed. No server/shared implementation,
Socket.IO connection, room code, lobby, identity, account, database, payment,
matchmaking, secret-rule networking, or authoritative mini-game was added.
Phase 1 still requires explicit approval.

## What changed and how to try it

Run `pnpm dev` from the root and open [the homepage](http://localhost:3000).

| Interaction | How to test | Expected result |
| --- | --- | --- |
| Hero cards | Hover with a mouse; click/tap each card | Small lift/tilt with motion enabled; one inspected card comes forward and straightens. Other cards remain visible. Tap the same card to set it down. |
| Local Button demo | Scroll to The Button; press the red button once | 12 → 13 (you) → 14 (fictional Liv) → 16 (fictional Milo). It pauses, asks why the counter increased by two, reveals Milo's example rule, and ends with the final teaching line. |
| Reset | Press RESET DEMO during or after the sequence | Returns to 12. Old scheduled callbacks cannot advance a reset or newer run. Repeat presses during a run do nothing. |
| Avatar reactions | Watch the scripted presses and unexpected increase | Small press bounces, surprised reactions, then suspicious glances. No continuous animation loop. |
| How to Play | Open either HOW TO PLAY control | Four steps, NEXT/BACK, a revealable Liv card, and a final visual comparison. Reopening starts at step 1. |
| Tutorial dismissal | Close, click outside the dialog, or press Escape | Dialog closes and focus returns to its trigger. Tab wraps within the modal. Step changes focus the new heading. |
| Final Create/Join | Use either final tutorial action or the hero actions | An honest UI-preview notice; no room is created or joined. |
| Settings | Open the gear; change toggles, sliders, or motion, then reload | Preferences persist in this browser origin. No account or server request. |
| Sound | Enable MASTER SOUND, select a low volume, press TEST SOUND | A short original synthesized placeholder. UI mute only silences UI events; master mute silences everything. |
| Hidden detail | Click the header logo five times | One brief eye reaction and a small classified message; it dismisses after 4.5 seconds, once per page load. |

Native buttons and focus outlines remain in place. No custom cursor is used.
Short/phone dialogs scroll internally when needed; background scrolling is locked
while a modal is open. OS reduced motion always wins over the Full preference.
Reduced motion keeps every control, script beat, and reveal available without
animated movement. The demo does not automatically start on page load.

## Isolated teaching script

`apps/web/src/components/home/demo/script.ts` contains immutable public frames
and a small reducer. The visitor's press begins the sequence. Each frame
schedules at most one cancellable timeout; advancement includes both a run
identifier and the expected previous stage. Reset increments the run identifier.
Cleanup cancels pending work, and idle/completed states schedule nothing.

The sequence takes approximately 11 seconds in an active tab; browser timer
throttling may make it longer in a background tab. It stops at 16 without a score,
win/loss result, round expiry, random outcome, or authoritative player data.
These are fictional teaching beats, not real secret assignments. Never reuse
this script as a future multiplayer engine or move it into shared network types.

## Sound implementation

There are **no final sound files** and no downloaded audio. The output adapter
creates original, quiet sine tones with short frequency and volume envelopes
using the browser's Web Audio API. They are placeholders.
A later approved phase can replace the adapter with licensed local assets
without changing callers.

| Event | Channel / current use |
| --- | --- |
| `uiHover` | UI: restrained mouse hover feedback, throttled |
| `uiClick` | UI: ordinary buttons |
| `cardFlip` | UI: public example conceal/reveal |
| `cardSlide` | UI: card inspection and tutorial steps |
| `buttonPress` | Demo: physical scripted presses and TEST SOUND |
| `counterTick` | Demo: ordinary counter increases |
| `unexpectedCounter` | Demo: Milo's two-count increase |
| `secretReveal` | Demo: teaching reveal and classified detail |
| `success` | Reserved hook; no fabricated success outcome |
| `failure` | Reserved hook; no fabricated failure outcome |

Sound is muted by default. The audio context is lazy and only unlocked by user
activation when sound is enabled; hovering cannot unlock it. Tones are short,
low amplitude, and limited to six simultaneous voices. Muting/changing preferences
or hiding the page stops current voices. Unmount closes the audio context.
Unsupported or blocked audio fails silently without breaking interactions.

The controller accepts an output adapter for testing. UI gain is master volume
multiplied by UI volume; demo gain uses master volume. Channel/master toggles
are applied before playing. Sound never determines a state transition.

## Functional settings

- MASTER SOUND: enabled/muted plus 0–100% volume; defaults muted at 45%.
- UI SOUND: enabled/muted plus 0–100% volume; defaults enabled at 50%, still
  subject to master mute. Demo sound remains separate from the UI mix.
- MOTION: Full or Reduced; defaults Full, but the device's reduced-motion
  request always disables animation. The panel explains this override.

Preferences use the versioned key `secret-rules:preferences:v1`. A strict Zod
schema rejects malformed, oversized, out-of-range, unexpected, or old-version
data. Hydration reads saved values before writing anything; storage failures
fall back to working in-memory preferences with a visible notice. A storage
event synchronizes preferences across same-origin tabs. Only preferences persist,
never demo progress, identities, credentials, rules, scores, or room state.

## Files

New files:

- `apps/web/src/audio/sounds.ts`
- `apps/web/src/preferences/store.ts` and `provider.tsx`
- `apps/web/src/components/home/demo/script.ts` and `button-demo.tsx`
- `apps/web/src/components/home/interaction-state.ts`
- `apps/web/src/components/home/secret-card-scene.tsx`
- `apps/web/src/components/home/how-to-play.tsx`
- `apps/web/src/components/home/settings-panel.tsx`
- `apps/web/src/styles/interactions.css`
- `apps/web/test/interactions.test.tsx`
- `docs/PHASE_0_6.md`

Updated: homepage composition, GameButton, GameModal, SecretCard, PlayerBadge,
the logo pupil's CSS class (no geometry changes), global style imports/motion,
homepage presentation assertions, AGENTS, README, and the architecture,
multiplayer, game design, design system, and roadmap documents.

## Tests and verification

The new interaction suite covers the exact 11-second counter script, repeated
presses, reset at every stage, stale callbacks, timer cancellation/terminal
states, tutorial bounds/reset, one selected card/native semantics, preference
hydration/persistence, invalid stored data, blocked/quota-limited storage,
OS motion precedence, sound channels/volume/lifecycle, and the logo threshold.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` from the root.
Unit tests use the existing Node test runner; they are not a substitute for
real-browser interaction tests.

### Final results

- `pnpm typecheck`: passed across shared, server, and web.
- `pnpm lint`: passed with zero warnings.
- `pnpm test`: 26 passed, zero failed (4 server, 22 web). Thirteen interaction
  tests were added, and the existing homepage-scope assertion was updated.
- `pnpm build`: passed for shared, server, and the statically rendered Next page.
- Production browser smoke test: counter 12 → 13 → completed 16, public Milo
  reveal, final message, and reset to 12; no console warnings or errors reported.
- Both tutorial triggers, all steps, reveal, Back, close, Escape, focus return,
  first/last Tab wrapping, reopen/reset, and preview-only final actions checked.
- All three card selections checked at phone width; one primary card at a time.
- Master/UI toggles, both live volume sliders, motion, and reload persistence
  checked through the UI. Production volume/motion persistence also checked.
- Homepage, completed demo, tutorial, and settings checked at all seven sizes
  below. No horizontal overflow; dialog background scroll lock verified.

Browser review caught and fixed a Strict Mode modal-cleanup dismissal and range
input event handling before the final checks. No unresolved check failures remain.

Browser review targets 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024,
390×844, and 320×740 CSS viewports. Check homepage card bounds, counter/reveal,
settings, and tutorial at every size. Internal modal scrolling is intentional on
short screens; horizontal overflow is not. Temporary screenshots/measurements
live in ignored `.local/qa/phase-0.6`.

This is not a full cross-browser, screen-reader, or physical touch-device audit.
Sound quality/listening on real devices and a complete native Tab/Enter/Space
keyboard pass remain manual release checks. Automated UI activation alone does
not prove that a user's audio output device produced a sound.
The test browser requested reduced motion at the device level; its override and
disabled animations were checked. Full-motion animation playback still needs a
visual pass on a device that does not request reduced motion.

## Implementation references

- [React external store subscriptions](https://react.dev/reference/react/useSyncExternalStore)
  informs stable client/server preference snapshots and browser hydration.
- [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
  informs user activation, optional sound, and volume controls.

**Stop here. Do not start Phase 1 without approval.**
