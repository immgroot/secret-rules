# SECRET RULES — Design System

## Scope

Phase 0.5 establishes the approved visual foundation; Phase 0.6 adds interactions
without redesigning it. Phase 1 extends the same identity to create/join forms
and a synchronized lobby. Public example cards remain teaching material, not
actual secret assignments.

## Visual direction

A midnight card table: warm near-black olive, cream paper, electric lime,
lavender, and a restrained red physical button. Slightly rotated cards,
perforation lines, tactile shadows, and small instruction stamps suggest a box
of mysterious rules. Large condensed titles carry the energy; generous space
keeps the composition readable. Avoid glass panels, broad gradients, dashboard
layouts, stock illustrations, or a casino aesthetic.

The homepage includes the hero, a four-step explanation, and one isolated local
Button demo. Create/Join now open real room entry flows. Settings, inspection, the
tutorial, and the explicitly scripted demo affect presentation only. The red
control is now a native button with a fixed teaching sequence, not real gameplay.

## Original logo: Blind Fold

The symbol is one folded instruction card with an eye cut through its body. The
fold hides part of the card while the eye suggests that somebody knows more than
you do. A simple pupil and broad silhouette preserve recognition at small sizes.
The stacked wordmark uses original cut-corner letter paths; it has no font dependency.

Canonical geometry: `apps/web/src/components/brand/artwork.ts`.
React exports: `FullLogo`, `LogoMark`, and `MonochromeLogo` from `brand/logo.tsx`.

| Asset | Use |
| --- | --- |
| `apps/web/public/brand/full-logo.svg` | Lime mark and cream wordmark, for dark backgrounds |
| `apps/web/public/brand/logo-mark.svg` | Standalone lime mark |
| `apps/web/public/brand/monochrome-logo.svg` | One-color mark and wordmark; inline SVG can inherit `currentColor` |
| `apps/web/public/brand/favicon.svg` | Mark on a dark rounded square, used by Next metadata |

Regenerate assets after changing canonical geometry with `pnpm brand:generate`.
Commit generated SVGs, not just the generator. Do not independently edit React
paths and downloaded assets. Keep clear space around the mark; do not stretch,
add effects, substitute emoji, or place the lime/cream version on pale paper.
Use the mark instead of the full wordmark at favicon size.

## Tokens and typography

`apps/web/src/styles/tokens.css` is the semantic source of truth. It includes
page/elevated/card/secret surfaces, text and ink tones, two accents, player tones,
success/warning/danger, borders, shadows, spacing, radii, type scale, tracking,
easing, and durations. Tailwind theme aliases point to these same variables.
Component styles live in `components.css`; page composition lives in `home.css`.
Phase 0.6 behavior styling lives in `interactions.css`, using the same tokens.
`src/app/globals.css` supplies global accessibility, base styles, and motion rules.

| Role | Choice |
| --- | --- |
| Page / elevated / card | `#131610` / `#1d2119` / `#252a20` |
| Secret paper / alternate paper | `#eee9da` / `#c1d18f` |
| Primary / secondary accent | Lime `#d4f462` / lavender `#c5b5ee` |
| Primary / secondary / muted text | `#f5f1e7` / `#c3c6b8` / `#939b88` |
| Paper ink / muted ink | `#20251b` / `#454d38` |
| Display | Barlow Condensed ExtraBold; titles and large rule statements |
| UI | DM Sans variable; instructions, controls, and body text |
| Secret labels | IBM Plex Mono Medium; rule stamps, player labels, codes, and numbers |

Fonts are local through `next/font/local`, with fallback fonts and `display: swap`.
No third-party font request is needed at runtime or build time. Three font files
and their OFL licenses live in `src/styles/fonts`; `sources.json` records official
download URLs, byte counts, and SHA-256 values. Do not remove their license files.
Sources: [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed),
[DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), and
[IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono).

## Consistent icon family

`GameIcon` in `components/icons/game-icon.tsx` uses original 24px SVG linework,
1.8px strokes, and rounded caps/joins. Its names cover create, join, players,
host, ready, secret, rule, timer, score, settings, audio, copy, leave, warning,
success, failure, connection, reconnect, arrow, diagonal, close, and play.

Icons are decorative by default. Supply `label` when an icon independently
conveys meaning, and name icon-only buttons with `aria-label`. Connection/ready
states use text or named icons, never color alone. Do not mix icon libraries.

## Reusable presentation components

Import from `apps/web/src/components/ui/index.ts` inside the web app.

| Component | Contract and responsibility |
| --- | --- |
| `GameButton` | Native button; primary, secondary, ghost, danger; normal/small/icon sizes; defaults to `type="button"`; optional sound feedback through context |
| `GameCard` | Shared elevated surface, spacing, border, and radius; accepts ordinary div attributes |
| `SecretCard` | Supplied rule/owner/tone; reveal mode uses `interactive`/`initiallyRevealed`; optional controlled `onInspect`/`inspected` mode uses one native `aria-pressed` control; `example` labels public examples |
| `PlayerBadge` | Supplied name, tone, host, ready, compact, and reaction (`idle`, `press`, `surprised`, `suspicious`); no player lookup or identity ownership |
| `StatusBadge` | Supplied text, tone, and optional icon |
| `GameTimer` | Formats supplied `endTime` and `serverTime` in milliseconds; no timer loop or expiry action |
| `ScoreBadge` | Renders a supplied score; finite values as given, invalid values as a dash |
| `GameModal` | Controlled `open`/`onClose`, title, description, children, optional class; native modal dialog, Escape/backdrop close, focus wrap/restoration |
| `GameToast` | Controlled message and dismissal; persistent live-region feedback, no auto-dismiss timer |
| `ConnectionIndicator` | Supplied connected/reconnecting/disconnected/preview status; never opens a connection |
| `RoomCode` | Displays and copies a supplied code; no code generation, validation, room creation, or joining |
| `SectionTitle` | Consistent eyebrow and semantic level-two heading |

Example renderer usage (these values are illustrations, not game state):

```tsx
<GameTimer endTime={30_000} serverTime={0} />
<ScoreBadge score={0} />
<SecretCard rule="PUBLIC EXAMPLE" ownerLabel="YOU" interactive example />
<ConnectionIndicator status="preview" />
```

The Phase 1 lobby adapter supplies validated public projections. Future gameplay will require separate recipient-authorized private projections.
Neither a component nor the browser calculates authoritative results. Null or
non-finite timer inputs render `--:--`; elapsed values display `00:00` without
triggering gameplay. The homepage demo uses a fixed script, not a running game
countdown, and no longer displays a decorative timer or score.

`SecretCard` removes concealed instruction text from its visible markup, but
the browser already has the supplied prop. **Concealment is not privacy or
authorization.** Never pass another player's private objective into a browser,
even through HTML, RSC data, hidden props, or a shared catalog. All homepage
instructions are deliberately public examples. For future round changes, key a
card by its authorized round/rule identity if its reveal preference must reset.

## Motion and accessibility

- Native buttons, headings, links, a skip link, and visible focus outlines.
- The modal uses `showModal()` for native modal focus behavior, with close,
  backdrop, and Escape handling; title/description are associated with ARIA.
- Reveal controls expose expanded state; inspection controls expose pressed state.
  Tutorial steps focus their heading; demo narration uses a polite status region.
- Primary/icon controls have at least 44px touch targets; the checkbox's label
  row provides a larger activation target.
- Tactile hover/press: 120ms. Small transitions: 220ms. Card reveal: 360ms.
  Entrances: 480ms. No continuous pulsing. Only the explicitly activated local
  demo runs simulated updates; a reset cancels its pending presentation work.
- Pointer tilt is limited to a few degrees and only applies to mouse pointers.
- OS `prefers-reduced-motion` always disables animations, transitions, smooth
  scrolling, and pointer tilt. The saved Reduced motion setting does the same and
  cannot override the OS setting to enable motion.
- Semantic text colors have a regression test for at least 4.5:1 contrast on
  their intended surfaces. Decorative strokes are not text contrast claims.

## Verification and limits

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` from the root.
The unit suite includes server foundation checks, presentation markup, explicit
timer/score inputs, text escaping, isolated demo scope, contrast, scripted reset,
settings persistence, sound mixing, and tutorial/inspection state.
It does not replace browser accessibility or real-device testing.

Browser review covers 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024,
390×844, and 320×740. Check overflow, card bounds/text, the settings dialog,
preview notices, reveal state, motion preference, and navigation after UI changes.
Temporary screenshots and measurements belong in ignored `.local/qa`, not assets.

### Phase 0.5 handoff results

- `pnpm brand:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and
  `pnpm build` all exited successfully. Tests: 13 passed (4 server, 9 web).
- The production homepage was opened and reviewed at all seven sizes above.
  Document width matched the viewport's available width; every example card
  stayed within its bounds and its text fit. No production console warnings or
  errors were reported during that review.
- Create/Join preview notices, conceal/reveal, settings open/close, focus entry
  and restoration, the local motion toggle, the how-to anchor, and mobile dialog
  dimensions were checked in the browser. The example counter remained 12.
- Full native Tab/Enter/Space/Escape navigation and OS-level reduced-motion
  emulation were not verified by this browser automation. Check those manually
  in a normal browser before release; native semantics and reduced-motion CSS
  are present. This is not a complete screen-reader or cross-browser audit.
- The first final-check attempt hit a pnpm cache/network permission restriction.
  The existing frozen lockfile dependencies were restored with permission, then
  every command passed. No dependency versions changed or new packages were added.

### Phase 0.6 handoff

See [PHASE_0_6.md](./PHASE_0_6.md) for current interactions, sound placeholders,
settings, tests, and browser verification. The Phase 0.5 results above are historical.

Those results describe the historical Phase 0.6 handoff. Phase 1 is documented below.

## Phase 1 — lobby extension

The homepage composition, logo, local fonts, tokens, icon family and teaching demo
are preserved. `styles/lobby.css` adds only lobby/entry composition. Root
AppProviders owns one presentation provider and one multiplayer provider; pages
do not duplicate either manager.

- Create/join forms use the existing GameModal, input labels, avatar shapes and
  GameButton feedback. `/join/[code]` provides the same form as a standalone invite.
- Lobby uses the existing card/table surfaces, condensed headings and mono labels.
  The room code is readable/copyable; copy failures include a manual fallback.
- Roster badges show YOU/HOST/READY/NOT READY/RECONNECTING in text as well as color.
  Server snapshots own every count, name, readiness and role. Guest settings are
  natively disabled via fieldset. Phase 2 replaces the old disabled START GAME
  control with host-only rule preparation after every active player is ready.
- Join/leave/ready animations last 160–220ms. Leaving rows are public visual echoes
  only and aria-hidden. Global OS and saved Reduced motion rules still apply.
- A fixed reconnect status overlay preserves the last roster while controls are
  disabled. It does not invent a client-side grace countdown or timer owner.
- Copy feedback, dialogs, pending indicators and preferences are local UI state.
  No room credential enters component props, HTML or public snapshots. Phase 2
  private cards receive only the current authenticated player's in-memory projection.

Verified lobby widths: 1920, 1440, 1366, 768, 430, 390 and 320 CSS pixels. The
320px create modal fits its viewport. See [PHASE_1.md](./PHASE_1.md) for current
browser/check results and remaining real-device/accessibility testing limits.

## Phase 1.6 — lobby and social extension

The homepage composition and established tokens remain unchanged. Lobby-only CSS
extends the same tabletop surfaces with ten readable player accents, four simple
avatar silhouettes, neutral spectator treatment, status chips, compact contextual
menus, safe profile/report confirmations, bounded chat and collapsible ROOM / GAME /
PLAYER controls. Text labels accompany every color/status signal.

Menus use native buttons with Arrow/Home/End/Escape/Tab handling, outside-click
close and focus restoration. Native dialogs trap focus across buttons, links,
inputs, selects and textareas. Chat is a labeled log with plain text nodes, an
explicit compose label and Enter/Shift+Enter instructions. Reduced-motion rules
continue to disable nonessential arrivals/status motion. See
[PHASE_1_6.md](./PHASE_1_6.md) for the current browser and manual test matrix.

## Phase 3.3 — gameplay table extension

The active game uses the existing brand tokens as one custom physical object,
not a grid of dashboard cards. `GameTable` provides a dark layered housing,
recessed textured surface, restrained lime edge, fasteners, perimeter seat slot,
center-game slot and compact public-log slot. The Button center supplies the
objective, split-digit mechanical counter, indicator lights, red domed control
and private move-status line. Future approved mini-games may replace only that
center while reusing the HUD, table seating, chat and Secret access.

Desktop uses a wide oval with count-aware 4–10 seating. Mobile changes geometry
to a tall rounded table with a compact wrapping roster; it does not scale the
desktop ellipse into illegibility. Chat overlays as a 322px desktop drawer or
mobile bottom sheet, and the table never reserves an empty chat column. Counter,
seat and urgency motion remain short and are removed by the existing saved/OS
reduced-motion rules.
