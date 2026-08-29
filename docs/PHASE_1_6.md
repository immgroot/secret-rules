# Phase 1.6 — Lobby and Social Handoff

## Implemented inventory

- Server-owned room name, PRIVATE/PUBLIC future-listing eligibility, lock and
  optional salted scrypt password protection.
- Contextual player menus, public safe profiles, personal mute, private reports,
  confirmed manual host transfer and removal of connected/disconnected/spectator seats.
- Four stylized avatars, ten unique server-owned colors, server randomization,
  validated manual changes and clear active/spectator roles.
- Three-minute server AFK state from meaningful throttled interaction hints, kept
  separate from reconnecting presence and never used for automatic removal.
- Separate eight-seat spectator capacity with public-only state and public chat.
- Plain-text room chat with bounded in-memory history, deduplication and abuse limits.
- ROOM / GAME / PLAYER control groups, authoritative status chips, password-aware
  progressive join flow, copy-code/invite feedback, responsive menus and dialogs.
- Disabled START GAME remains a phase boundary. No secret rules or gameplay exist.

## Automated verification

From the repository root run:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` includes real Socket.IO clients and unit/presentation tests. Relevant
server cases cover password/lock/resume, async security races, kick/rejoin/revoked
credentials, transfer permissions, color reservations, spectators, AFK, chat,
reports, malicious input, deduplication and cleanup. Web cases prove hostile chat
is escaped, personal mute is viewer-local/persistent/bounded, and activity hints
ignore cosmetic movement and clean up listeners.

## Exact four-browser-session walkthrough

Use four independent tabs/windows on the same origin. Avoid Duplicate Tab because
it may copy sessionStorage and intentionally exercise session replacement. Label
them A, B, C and D.

1. In A, open `/`, CREATE ROOM as `Groot`, choose an avatar, enter room name
   `WE ARE STILL FRIENDS`, and copy the code and invite. Confirm PRIVATE,
   UNLOCKED and PASSWORD OFF. The invite contains only `/join/CODE`.
2. Open the invite independently in B, C and D. Join B as `Milo` / PLAY, C as
   `Estrix` / PLAY and D as `June` / SPECTATE. Confirm three colored players,
   one neutral spectator, distinct labels/colors and the same room/version.
3. In A, change visibility to PUBLIC, lock the room and enable an 8+ character
   password. Confirm every session shows PUBLIC / LOCKED / PASSWORD ON and the
   password never appears in the page, invite URL or another session's controls.
4. Open a temporary fifth independent invite. Confirm LOCKED rejects a new join.
   Unlock in A. Try no password, a wrong password and the correct password; expect
   required/incorrect/success respectively. Leave that temporary seat, relock,
   refresh B and confirm the saved B identity resumes while locked without asking
   for the password.
5. Ready B and C together; all four sessions must converge. In each active player
   panel, check occupied colors are disabled. Change B's free color, randomize C,
   refresh and confirm identities/colors are stable and still unique.
6. From D, confirm ready/color controls do not exist. Switch D from SPECTATE to
   PLAY if a player seat is free: it gets a unique color and is not ready. Switch
   back: ready clears and the player seat/color become available. D can chat but
   remains visibly a spectator.
7. Send `Hello 🙂 <script>alert(1)</script>` from A. Confirm A/B/C/D see it as
   literal text and no dialog/script runs. Send with Enter; use Shift+Enter for a
   newline. Send six messages quickly and confirm the rate-limit message, then wait.
8. In B's menu for A, choose MUTE · JUST FOR YOU. Send again from A. Confirm A/C/D
   still see it while B does not. Refresh B; confirm “MUTED FOR YOU” persists.
   UNMUTE and confirm history reappears.
9. In C's menu for A, REPORT with a reason/short description. Confirm REPORT
   SUBMITTED says it is temporary server memory. Repeat immediately for A and
   confirm duplicate rejection. Verify A receives no reporter notice/details.
10. Open every profile. Confirm avatar/name/color/host/readiness/role/AFK/
    connection/join time and future-stat placeholder appear. Confirm no socket ID,
    token, IP, password/hash or internal credential appears.
11. From A, open Estrix's menu, TRANSFER HOST and confirm. C gains ROOM/GAME host
    controls immediately; A's controls disable/disappear. Attempt old-host actions
    in A and confirm the server/UI rejects them. Exactly one HOST label remains.
12. In C, REMOVE Milo and confirm. B sees YOU WERE REMOVED / RETURN HOME, stops
    receiving/sending chat, and its old refresh credential cannot resume. The slot
    and color free. If unlocked and using the correct password, B may manually join
    later as a fresh participant with a new seat.
13. Test a disconnected reservation: close an active transport or take it offline;
    others see RECONNECTING, not AFK. Restore it within 60 seconds and confirm the
    same player, readiness/color and bounded chat history return without duplicates.
14. Leave one connected tab untouched for three minutes while interacting in the
    others. Confirm it becomes AFK but remains connected/in-room. Click or type in
    it and confirm AFK clears everywhere. Mouse hover alone must not prevent AFK.
15. Test keyboard access: Tab to player menus, use Arrow/Home/End, Escape and Tab;
    verify focus restoration and dialog trapping. At desktop/tablet/mobile widths,
    check no horizontal overflow, menu stays on-screen, statuses use words/icons,
    focus is visible and reduced-motion preference removes nonessential motion.

## Known boundaries

Everything is one-process memory. A server restart loses rooms/chat/reports and
invalidates resume credentials. PUBLIC creates no listing. Reports are not durable
or reviewed by a moderation dashboard. There is no voice, permanent ban, database,
account, payment, matchmaking, achievement, rematch, secret rule, score, round or
real mini-game. These remain explicit future phase gates.
