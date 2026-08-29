"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ERROR_MESSAGES, EVENTS, type PrivatePlayerRoundState, type PublicPlayer, type PublicRoundState } from "@secret-rules/shared";
import { useRouter } from "next/navigation.js";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { usePreferences, useSound } from "../../preferences/provider.tsx";
import { FullLogo } from "../brand/logo.tsx";
import { SettingsPanel } from "../home/settings-panel.tsx";
import { GameIcon } from "../icons/game-icon.tsx";
import { ChatMessages } from "../lobby/chat-panel.tsx";
import { GameButton, GameModal, PlayerBadge, SecretCard } from "../ui/index.ts";
import { formatRemainingTime } from "../ui/presentation.ts";
import { GameTable } from "./game-table.tsx";

function useServerClock(round: PublicRoundState) {
  const [now, setNow] = useState(round.serverNow);
  useEffect(() => {
    const clientStartedAt = Date.now();
    const serverStartedAt = round.serverNow;
    const timer = setInterval(() => setNow(serverStartedAt + Date.now() - clientStartedAt), 50);
    return () => clearInterval(timer);
  }, [round.serverNow]);
  return now;
}

function GameplayChat({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const { room, playerId, client, pending, connection, mutedPlayerIds } = useMultiplayer();
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const messages = room?.chatMessages;
  const seen = useRef<string | null>(messages?.at(-1)?.messageId ?? null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = messages ?? [];
    const latest = list.at(-1);
    if (!latest || latest.messageId === seen.current) return;
    const previousIndex = seen.current ? list.findIndex((message) => message.messageId === seen.current) : -1;
    const incoming = list.slice(Math.max(0, previousIndex + 1)).filter((message) => message.authorId !== playerId);
    seen.current = latest.messageId;
    if (!open) setUnread((count) => count + incoming.length);
  }, [messages, open, playerId]);
  useEffect(() => { if (open && log.current) log.current.scrollTop = log.current.scrollHeight; }, [open, messages]);
  async function send() {
    if (!draft.trim() || pending || connection !== "connected") return;
    if (await client.send(EVENTS.chat, { text: draft })) setDraft("");
  }
  const openChat = () => { setUnread(0); setOpen(true); };
  return <>
    <button className="game-chat-tab" aria-label={unread > 0 ? `Open chat, ${unread} unread` : "Open chat"} onClick={openChat}><GameIcon name="players" size={18} /><b>CHAT</b>{unread > 0 && <span>{unread}</span>}</button>
    {open && <button className="game-chat-scrim" aria-label="Close chat" onClick={() => setOpen(false)} />}
    <aside className="game-chat" data-open={open} aria-hidden={!open} inert={!open || undefined}>
      <header><div><span className="eyebrow">TABLE TALK</span><strong>ROOM CHAT</strong></div><button aria-label="Hide chat" onClick={() => setOpen(false)}><GameIcon name="close" /></button></header>
      <div ref={log} className="game-chat__log" role="log" aria-label="Room chat messages" aria-live="polite"><ChatMessages messages={messages ?? []} mutedIds={mutedPlayerIds} />{(messages?.length ?? 0) === 0 && <p className="chat-empty">Nobody has blamed anyone. Yet.</p>}</div>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor="game-chat-message">Message</label><textarea id="game-chat-message" rows={2} maxLength={280} value={draft} placeholder="WHY DID THAT GO UP 2?" disabled={pending || connection !== "connected"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /><GameButton type="submit" size="small" disabled={!draft.trim() || pending || connection !== "connected"}>SEND</GameButton></form>
    </aside>
  </>;
}

function ButtonPrimer({ close }: { close: () => void }) {
  return <GameModal open title="THE BUTTON." description="One public challenge. A table full of private motives." className="button-primer" dismissible={false} onClose={() => {}}>
    <div className="button-primer__rules">
      <span><strong>01</strong> GET TO EXACTLY 20.</span>
      <span><strong>02</strong> PRESSING NORMALLY ADDS +1.</span>
      <span><strong>03</strong> YOU CAN’T PRESS TWICE IN A ROW.</span>
      <span><strong>04</strong> EVERYONE HAS A DIFFERENT SECRET RULE.</span>
    </div>
    <GameButton onClick={close}>SHOW ME MY RULE <GameIcon name="arrow" size={16} /></GameButton>
  </GameModal>;
}

function RuleDeal({ round, privateRound, spectator }: { round: PublicRoundState; privateRound: PrivatePlayerRoundState | null; spectator: boolean }) {
  const { client, pending, connection } = useMultiplayer();
  const [revealed, setRevealed] = useState(false);
  const waiting = round.publicPlayerStatuses.filter((status) => !status.acknowledged).length;
  const waitingText = waiting === 0 ? "EVERYONE’S READY." : `WAITING FOR ${waiting} PLAYER${waiting === 1 ? "" : "S"}…`;
  if (spectator || privateRound?.acknowledgedAt !== null && privateRound) return <div className="rule-waiting" role="status"><span>{waitingText}</span><small>THE TABLE IS ALMOST READY.</small></div>;
  if (!privateRound) return <div className="rule-waiting" role="status"><span>YOUR RULE IS ON ITS WAY…</span></div>;
  return <GameModal open title="YOUR RULE HAS ARRIVED." className="game-rule-deal" dismissible={false} onClose={() => {}}>
    <SecretCard rule={privateRound.secretRule.description} ownerLabel="KEEP THIS TO YOURSELF." tone={privateRound.secretRule.category === "hidden_ability" ? "violet" : "paper"} kind={privateRound.secretRule.category === "hidden_ability" ? "ability" : "rule"} variant="deal" interactive initiallyRevealed={false} onRevealChange={setRevealed} />
    <GameButton className="rule-acknowledge" disabled={!revealed || pending || connection !== "connected"} onClick={() => void client.acknowledgeRule()}>{revealed ? "I’VE GOT IT" : "REVEAL YOUR RULE FIRST"}</GameButton>
  </GameModal>;
}

function SecretDrawer({ state }: { state: PrivatePlayerRoundState }) {
  const [open, setOpen] = useState(false);
  const held = useRef(false);
  const pointer = useRef<{ at: number; wasOpen: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key.toLowerCase() !== "r" || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable) return;
      event.preventDefault(); held.current = true; setOpen(true);
    };
    const up = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "r" && held.current) { held.current = false; setOpen(false); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  const reveal = (event: ReactPointerEvent) => { event.currentTarget.setPointerCapture(event.pointerId); pointer.current = { at: performance.now(), wasOpen: open }; setOpen(true); };
  const finishPointer = () => {
    if (!pointer.current) return;
    const longHold = performance.now() - pointer.current.at > 260;
    setOpen(longHold ? false : !pointer.current.wasOpen);
    pointer.current = null;
    suppressClick.current = true;
  };
  const progress = state.privateProgress.status === "not_started" ? "STILL POSSIBLE" : state.privateProgress.summary;
  return <div className="secret-drawer" data-open={open}>
    <button aria-expanded={open} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen(!open); }} onPointerDown={reveal} onPointerUp={finishPointer} onPointerCancel={finishPointer}><GameIcon name="secret" size={18} /> {open ? "HIDE SECRET" : "VIEW SECRET"}<span>HOLD R</span></button>
    {open && <div className="secret-drawer__card"><SecretCard rule={state.secretRule.description} ownerLabel="YOU / PRIVATE" tone={state.secretRule.category === "hidden_ability" ? "violet" : "paper"} kind={state.secretRule.category === "hidden_ability" ? "ability" : "rule"} /><div className="secret-progress"><span>{progress}</span>{state.privateProgress.target !== null && <strong>{state.privateProgress.current ?? 0} / {state.privateProgress.target}</strong>}</div></div>}
  </div>;
}

function participant(round: PublicRoundState, players: readonly PublicPlayer[], playerId: string) {
  const player = players.find((candidate) => candidate.playerId === playerId);
  return {
    name: player?.displayName ?? round.reveal?.entries.find((entry) => entry.playerId === playerId)?.displayName ?? "DEPARTED PLAYER",
    avatarId: player?.avatarId ?? "lime" as const,
    tone: player?.playerColor ?? "spectator" as const,
  };
}

function Standings({ round, players, final = false }: { round: PublicRoundState; players: readonly PublicPlayer[]; final?: boolean }) {
  const standings = final ? round.matchResult?.finalStandings ?? [] : round.roundScore?.standings ?? [];
  return <section className="match-standings" aria-labelledby={final ? "final-standings-title" : "round-standings-title"}>
    <p className="eyebrow">{final ? "THE FINAL TABLE." : "THE TABLE SO FAR."}</p>
    <h3 id={final ? "final-standings-title" : "round-standings-title"}>{final ? "FINAL STANDINGS" : "STANDINGS"}</h3>
    <ol>{standings.map((standing) => { const profile = participant(round, players, standing.playerId); return <li key={standing.playerId}>
      <strong>{standing.rank}</strong><PlayerBadge name={profile.name} avatarId={profile.avatarId} tone={profile.tone} compact /><span>{standing.score}</span>
    </li>; })}</ol>
  </section>;
}

function RoundScores({ round, players }: { round: PublicRoundState; players: readonly PublicPlayer[] }) {
  if (!round.roundScore) return null;
  return <section className="round-scores" aria-labelledby="round-scores-title"><p className="eyebrow">POINTS ARE PUBLIC NOW.</p><h3 id="round-scores-title">ROUND {round.roundNumber} POINTS</h3><div className="round-scores__grid">{round.roundScore.entries.map((entry) => {
    const profile = participant(round, players, entry.playerId);
    return <article key={entry.playerId}><PlayerBadge name={profile.name} avatarId={profile.avatarId} tone={profile.tone} compact />
      <dl><div><dt>SECRET RULE · {entry.secretRuleResult.replaceAll("_", " ").toUpperCase()}</dt><dd>+{entry.secretRulePoints}</dd></div>
        {entry.difficultyBonusPoints > 0 && <div><dt>HARD RULE BONUS</dt><dd>+{entry.difficultyBonusPoints}</dd></div>}
        {entry.wildBonusPoints > 0 && <div><dt>WILD BONUS</dt><dd>+{entry.wildBonusPoints}</dd></div>}
        <div><dt>TEAM CHALLENGE · {round.roundScore?.publicChallengeSucceeded ? "SUCCESS" : "FAILED"}</dt><dd>+{entry.publicChallengePoints}</dd></div>
        <div className="round-scores__total"><dt>ROUND TOTAL</dt><dd>+{entry.roundTotal}</dd></div>
        <div><dt>MATCH TOTAL</dt><dd>{entry.matchTotal}</dd></div></dl>
    </article>;
  })}</div></section>;
}

function RuleRevealCards({ round }: { round: PublicRoundState }) {
  if (!round.reveal) return null;
  return <><div className="round-reveal__grid">{round.reveal.entries.map((entry, index) => <article className="rule-reveal-card" key={entry.playerId} style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}><span>{entry.displayName}</span><strong>{entry.publicRuleDescription}</strong><em data-result={entry.status}>{entry.status.replaceAll("_", " ").toUpperCase()}</em><small>{entry.progressSummary}</small></article>)}</div>
    {round.reveal.relationshipHighlights.length > 0 && <div className="relationship-reveal"><strong>HIDDEN CONNECTIONS</strong>{round.reveal.relationshipHighlights.slice(0, 4).map((edge) => { const from = round.reveal?.entries.find((entry) => entry.playerId === edge.fromPlayerId)?.displayName ?? "A PLAYER"; const to = round.reveal?.entries.find((entry) => entry.playerId === edge.toPlayerId)?.displayName ?? "ANOTHER PLAYER"; return <span key={`${edge.fromPlayerId}-${edge.toPlayerId}-${edge.type}`}>{from} ↔ {to} · {edge.type.replaceAll("_", " ")}</span>; })}</div>}</>;
}

function RoundReveal({ round, host, players }: { round: PublicRoundState; host: boolean; players: readonly PublicPlayer[] }) {
  const { client, pending } = useMultiplayer();
  if (!round.reveal) return null;
  return <section className="round-reveal" aria-labelledby="round-reveal-title"><p className="eyebrow">THE TRUTH, UNFORTUNATELY.</p><h2 id="round-reveal-title">SECRET RULES REVEALED</h2><RuleRevealCards round={round} /><RoundScores round={round} players={players} /><Standings round={round} players={players} />
    <div className="round-reveal__continue">{host ? <GameButton disabled={pending} onClick={() => void client.continueRound()}>NEXT ROUND <GameIcon name="arrow" size={16} /></GameButton> : <p>WAITING FOR HOST…</p>}</div>
  </section>;
}

function MatchComplete({ round, players, host, requestLeave }: { round: PublicRoundState; players: readonly PublicPlayer[]; host: boolean; requestLeave: () => void }) {
  const { client, pending } = useMultiplayer();
  const winnerIds = round.matchResult?.winnerPlayerIds ?? [];
  const winnerNames = winnerIds.map((id) => participant(round, players, id).name.toUpperCase());
  const winnerScore = round.matchResult?.finalStandings[0]?.score ?? 0;
  const tied = winnerNames.length > 1;
  return <section className="match-complete" aria-labelledby="match-complete-title"><p className="eyebrow">ALL {round.totalRounds} ROUNDS ARE IN.</p><h2 id="match-complete-title">MATCH COMPLETE</h2>
    <div className="match-winners" data-tied={tied}>{winnerIds.map((id) => { const profile = participant(round, players, id); return <PlayerBadge key={id} name={profile.name} avatarId={profile.avatarId} tone={profile.tone} />; })}<strong>{winnerNames.join(" & ")} {tied ? "WIN" : "WINS"}</strong><span>{winnerScore} POINTS</span>{tied && <small>TIED WINNERS</small>}</div>
    <Standings round={round} players={players} final />
    <RoundScores round={round} players={players} />
    <details className="final-rule-reveal"><summary>VIEW FINAL ROUND SECRETS</summary><RuleRevealCards round={round} /></details>
    <div className="match-complete__actions">{host && <GameButton disabled={pending} onClick={() => void client.returnToLobby()}>RETURN TO LOBBY <GameIcon name="arrow" size={16} /></GameButton>}<GameButton variant="secondary" onClick={requestLeave}>LEAVE ROOM</GameButton>{!host && <p>THE HOST CAN RETURN THIS ROOM TO THE LOBBY.</p>}</div>
  </section>;
}

export function GameShell() {
  const { room } = useMultiplayer();
  if (!room?.publicRound) return null;
  return <ActiveGameShell />;
}

function ActiveGameShell() {
  const { room, privateRound, playerId, connection, pending, error, client } = useMultiplayer();
  const { reducedMotion } = usePreferences();
  const sound = useSound();
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [pressed, setPressed] = useState(false);
  const round = room!.publicRound!;
  const [helpOpen, setHelpOpen] = useState(round.roundNumber === 1 && round.phase === "waiting_for_rule_ack");
  const closeHelp = () => setHelpOpen(false);
  const now = useServerClock(round);
  const me = room!.players.find((player) => player.playerId === playerId);
  const players = room!.players.filter((player) => player.role === "player");
  const spectator = me?.role === "spectator";
  const rechargeActive = round.publicGameState.rechargeEndsAt !== null && now < round.publicGameState.rechargeEndsAt;
  const ownRepeatLock = round.publicGameState.lastNormalActorPlayerId === playerId;
  const remainingMs = round.publicTimer ? Math.max(0, round.publicTimer.deadlineAt - now) : 0;
  const timerTension = remainingMs <= 5_000 ? "critical" : remainingMs <= 15_000 ? "urgent" : "normal";
  const countdown = round.countdownEndsAt ? Math.max(0, Math.ceil((round.countdownEndsAt - now) / 1000)) : 0;
  const pressPulse = rechargeActive ? round.publicGameState.lastNormalActorPlayerId : null;
  const recent = round.publicActions.filter((action) => action.type === "COUNTER_CHANGED").slice(-3).map((change) => ({ ...change, actorPlayerId: round.publicActions.find((action) => action.sequence === change.sequence && action.type === "PLAYER_PRESSED")?.actorPlayerId ?? null }));
  const previousCounter = useRef(round.publicGameState.counter);
  useEffect(() => {
    if (round.publicGameState.counter !== previousCounter.current) {
      sound.play(round.publicGameState.lastDelta === 2 ? "unexpectedCounter" : "counterTick");
      previousCounter.current = round.publicGameState.counter;
    }
  }, [round.publicGameState.counter, round.publicGameState.lastDelta, sound]);
  const scoredRound = useRef<string | null>(null);
  const previousPhase = useRef(round.phase);
  useEffect(() => {
    if (round.roundScore && scoredRound.current !== round.roundId) {
      scoredRound.current = round.roundId;
      if ((round.roundScore.entries.find((entry) => entry.playerId === playerId)?.roundTotal ?? 0) > 0) sound.play("pointsEarned");
    }
    if (previousPhase.current !== round.phase) {
      if (round.phase === "reveal") sound.play("standingsReveal");
      if (round.phase === "match_complete") {
        sound.play("matchComplete");
        if (round.matchResult?.winnerPlayerIds.includes(playerId ?? "")) sound.play("winnerReveal");
      }
      previousPhase.current = round.phase;
    }
  }, [playerId, round.matchResult, round.phase, round.roundId, round.roundScore, sound]);
  async function leave() { if (await client.leave()) router.push("/"); }
  async function press() {
    if (round.phase !== "playing" || spectator || pending || connection !== "connected" || rechargeActive || ownRepeatLock) return;
    setPressed(true); sound.play("buttonPress");
    setTimeout(() => setPressed(false), 170);
    await client.pressButton();
  }
  const roundOver = ["resolving", "reveal", "round_complete", "match_complete"].includes(round.phase);
  const buttonState = roundOver ? "round-over" : round.phase !== "playing" || round.publicGameState.locked ? "disabled" : spectator ? "disabled" : connection !== "connected" ? "disabled" : pressed ? "pressed" : rechargeActive ? "recharging" : ownRepeatLock ? "waiting" : pending ? "disabled" : "available";
  const helper = buttonState === "available" ? "YOUR MOVE IS AVAILABLE" : buttonState === "pressed" || buttonState === "recharging" ? "BUTTON RECHARGING…" : buttonState === "waiting" ? "WAIT FOR SOMEONE ELSE." : spectator ? "SPECTATING · PUBLIC VIEW" : buttonState === "round-over" ? "ROUND OVER" : round.phase === "waiting_for_rule_ack" ? "WAITING FOR THE TABLE…" : "BUTTON UNAVAILABLE";
  const cap = buttonState === "available" || buttonState === "pressed" ? "PRESS" : buttonState === "recharging" ? "…" : buttonState === "waiting" ? "WAIT" : "LOCKED";
  const resultTitle = round.publicGameState.outcome === "success" ? "CHALLENGE COMPLETE." : round.publicGameState.outcome === "overshoot" ? "TOO FAR." : round.publicGameState.outcome === "timeout" ? "TIME’S UP." : "";
  const resultValue = round.publicGameState.outcome === "success" ? "EXACTLY 20." : round.publicGameState.outcome === "overshoot" ? String(round.publicGameState.counter) : `YOU REACHED ${round.publicGameState.counter}.`;
  const showError = error && !["BUTTON_RECHARGING", "BUTTON_REPEAT_LOCKED"].includes(error.code);
  const acknowledgedPlayerIds = new Set(round.publicPlayerStatuses.filter((status) => status.acknowledged).map((status) => status.playerId));
  const counterDigits = String(round.publicGameState.counter).padStart(2, "0").split("");
  const eventFeed = <aside className="public-feed" aria-label="Recent table actions" aria-live="polite"><span className="public-feed__title">TABLE LOG</span>{recent.length === 0 ? <small>NO ACTIONS YET</small> : recent.map((action) => <span key={action.actionId}><b>{room!.players.find((player) => player.playerId === action.actorPlayerId)?.displayName.toUpperCase() ?? "A PLAYER"}</b> PRESSED <strong>+{action.delta}</strong></span>)}</aside>;
  return <div className="game-shell" data-reduce-motion={reducedMotion} data-chat-open={chatOpen}>
    <a className="skip-link" href="#button-control">Skip to the Button</a>
    <header className="game-hud"><FullLogo className="game-hud__logo" /><span className="game-hud__round">ROUND {round.roundNumber} / {round.totalRounds}</span><div className="game-hud__tools"><span className="game-hud__timer" data-tension={round.phase === "playing" ? timerTension : "normal"}><GameIcon name="timer" size={17} />{round.phase === "playing" && round.publicTimer ? formatRemainingTime(round.publicTimer.deadlineAt, now) : round.phase.replaceAll("_", " ").toUpperCase()}</span><button aria-label="Game menu" onClick={() => setMenuOpen(true)}><GameIcon name="settings" /></button></div></header>
    <GameplayChat open={chatOpen} setOpen={setChatOpen} />
    <main className="game-stage">
      <GameTable players={players} playerId={playerId} readingPhase={round.phase === "waiting_for_rule_ack"} acknowledgedPlayerIds={acknowledgedPlayerIds} pressedPlayerId={pressPulse} choosePlayer={setSelected} eventFeed={eventFeed}>
        <section className="button-board" data-button-state={buttonState} aria-labelledby="button-target">
          <div className="button-console__display">
            <div id="button-target" className="button-target"><span>GET THE COUNTER TO</span><strong>EXACTLY 20</strong></div>
            <div className="button-counter" aria-live="polite"><span>CURRENT COUNTER</span><strong key={round.publicGameState.counter} aria-label={`Current counter ${round.publicGameState.counter}`}>{counterDigits.map((digit, index) => <i key={`${index}-${digit}`}>{digit}</i>)}</strong>{round.publicGameState.lastDelta !== null && <small data-unexpected={round.publicGameState.lastDelta !== 1}>+{round.publicGameState.lastDelta}</small>}</div>
          </div>
          <span className="button-console__lights" aria-hidden="true"><i /><i /><i /></span>
          <button id="button-control" className="physical-button" data-state={buttonState} disabled={buttonState !== "available"} onClick={() => void press()} aria-label={`Press the shared Button. ${helper}`}><span className="physical-button__housing"><i className="physical-button__cap" /><strong>{cap}</strong></span></button>
          <p className="button-helper" role="status">{helper}</p>
        </section>
      </GameTable>
      {helpOpen && round.roundNumber === 1 && round.phase === "waiting_for_rule_ack" && !spectator && <ButtonPrimer close={closeHelp} />}
      {!helpOpen && round.phase === "waiting_for_rule_ack" && <RuleDeal round={round} privateRound={privateRound} spectator={Boolean(spectator)} />}
      {round.phase === "countdown" && <div className="countdown" role="status"><small>EVERYONE’S READY.</small><span key={countdown}>{countdown > 0 ? countdown : "GO"}</span></div>}
      {round.phase === "resolving" && <div className="round-result" role="status"><span>{resultValue}</span><strong>{resultTitle}</strong></div>}
      {round.phase === "reveal" && <RoundReveal round={round} players={players} host={room!.hostPlayerId === playerId} />}
      {round.phase === "match_complete" && <MatchComplete round={round} players={players} host={room!.hostPlayerId === playerId} requestLeave={() => setLeaving(true)} />}
      {privateRound && !spectator && !["waiting_for_rule_ack", "reveal", "match_complete"].includes(round.phase) && <SecretDrawer state={privateRound} />}
      {spectator && round.phase !== "waiting_for_rule_ack" && <span className="spectator-chip"><GameIcon name="players" size={15} /> SPECTATING · PUBLIC VIEW</span>}
      {showError && <div className="game-error" role="alert">{ERROR_MESSAGES[error.code]}</div>}
    </main>
    {connection === "reconnecting" && <aside className="reconnect-overlay" role="status"><GameIcon name="reconnect" /><div><strong>RECONNECTING…</strong><p>Your seat, secret, and progress are held.</p></div></aside>}
    {menuOpen && <SettingsPanel connectionStatus={connection === "connected" ? "connected" : "reconnecting"} onClose={() => setMenuOpen(false)} />}
    {selected && <GameModal open title={selected.displayName.toUpperCase()} className="game-player-profile" onClose={() => setSelected(null)}><PlayerBadge name={selected.displayName} avatarId={selected.avatarId} tone={selected.playerColor ?? "spectator"} host={selected.isHost} /><p>{selected.connected ? selected.afk ? "AFK" : "AT THE TABLE" : "RECONNECTING…"}</p>{selected.playerId !== playerId && <div className="profile-actions"><GameButton variant="secondary" onClick={() => client.toggleMute(selected.playerId)}>MUTE / UNMUTE</GameButton><GameButton variant="ghost" onClick={async () => { await client.send(EVENTS.report, { targetPlayerId: selected.playerId, reason: "other", description: "Reported from gameplay profile." }); setSelected(null); }}>REPORT</GameButton></div>}</GameModal>}
    <button className="game-leave" onClick={() => setLeaving(true)}><GameIcon name="leave" size={15} /> LEAVE GAME</button>
    {leaving && <GameModal open title="LEAVE THE GAME?" description="Your active seat will be removed immediately." onClose={() => setLeaving(false)}><div className="leave-actions"><GameButton variant="secondary" onClick={() => setLeaving(false)}>STAY</GameButton><GameButton variant="danger" onClick={() => void leave()}>LEAVE</GameButton></div></GameModal>}
  </div>;
}
