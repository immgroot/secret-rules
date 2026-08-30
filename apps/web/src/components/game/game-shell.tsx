"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BUTTON_CARD_KINDS, BUTTON_CARD_LABELS, ERROR_MESSAGES, EVENTS, isTargetedButtonCard,
  type ButtonCard, type ButtonCardKind, type PrivatePlayerRoundState, type PublicPlayer, type PublicRoundState,
} from "@secret-rules/shared";
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
    const timer = setInterval(() => setNow(round.serverNow + Date.now() - clientStartedAt), 50);
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
    const prior = seen.current ? list.findIndex((message) => message.messageId === seen.current) : -1;
    const incoming = list.slice(Math.max(0, prior + 1)).filter((message) => message.authorId !== playerId);
    seen.current = latest.messageId;
    if (!open) setUnread((count) => count + incoming.length);
  }, [messages, open, playerId]);
  useEffect(() => { if (open && log.current) log.current.scrollTop = log.current.scrollHeight; }, [open, messages]);
  async function send() {
    if (!draft.trim() || pending || connection !== "connected") return;
    if (await client.send(EVENTS.chat, { text: draft })) setDraft("");
  }
  return <>
    <button className="game-chat-tab" aria-label={unread ? `Open chat, ${unread} unread` : "Open chat"} onClick={() => { setUnread(0); setOpen(true); }}><GameIcon name="players" size={18} /><b>CHAT</b>{unread > 0 && <span>{unread}</span>}</button>
    {open && <button className="game-chat-scrim" aria-label="Close chat" onClick={() => setOpen(false)} />}
    <aside className="game-chat" data-open={open} aria-hidden={!open} inert={!open || undefined}><header><div><span className="eyebrow">TABLE TALK</span><strong>ROOM CHAT</strong></div><button aria-label="Hide chat" onClick={() => setOpen(false)}><GameIcon name="close" /></button></header>
      <div ref={log} className="game-chat__log" role="log" aria-live="polite"><ChatMessages messages={messages ?? []} mutedIds={mutedPlayerIds} />{!messages?.length && <p className="chat-empty">Nobody has accused anyone. Yet.</p>}</div>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor="game-chat-message">Message</label><textarea id="game-chat-message" rows={2} maxLength={280} value={draft} placeholder="THAT WAS DEFINITELY +2." disabled={pending || connection !== "connected"} onChange={(event) => setDraft(event.target.value)} /><GameButton type="submit" size="small" disabled={!draft.trim() || pending || connection !== "connected"}>SEND</GameButton></form>
    </aside>
  </>;
}

function ButtonPrimer({ close }: { close: () => void }) {
  return <GameModal open title="THE BUTTON V2." description="Play hidden. Claim anything. Decide who to trust." className="button-primer" dismissible={false} onClose={() => {}}><div className="button-primer__rules">
    <span><strong>01</strong> START WITH 5 PRIVATE CARDS.</span><span><strong>02</strong> FOLLOW YOUR PRIVATE SECRET.</span>
    <span><strong>03</strong> PLAY A REAL CARD FACE-DOWN.</span><span><strong>04</strong> CLAIM ANY CARD IDENTITY.</span>
    <span><strong>05</strong> OPPONENTS MAY CALL BLUFF.</span><span><strong>06</strong> THE REAL CARD RESOLVES IF TRUSTED.</span>
    <span><strong>07</strong> LAND ON THE EXACT TARGET.</span><span><strong>08</strong> REVEAL SECRETS AND SCORE.</span>
  </div><GameButton onClick={close}>SHOW ME MY SECRET <GameIcon name="arrow" size={16} /></GameButton></GameModal>;
}

function RuleDeal({ round, privateRound, spectator }: { round: PublicRoundState; privateRound: PrivatePlayerRoundState | null; spectator: boolean }) {
  const { client, pending, connection } = useMultiplayer();
  const [revealed, setRevealed] = useState(false);
  const waiting = round.publicPlayerStatuses.filter((status) => !status.acknowledged).length;
  if (spectator || privateRound?.acknowledgedAt !== null && privateRound) return <div className="rule-waiting" role="status"><span>{waiting ? `WAITING FOR ${waiting} PLAYER${waiting === 1 ? "" : "S"}…` : "EVERYONE’S READY."}</span><small>THE CARDS ARE ON THE TABLE.</small></div>;
  if (!privateRound) return <div className="rule-waiting" role="status"><span>YOUR SECRET IS ON ITS WAY…</span></div>;
  return <GameModal open title="YOUR SECRET HAS ARRIVED." className="game-rule-deal" dismissible={false} onClose={() => {}}><SecretCard rule={privateRound.secretRule.description} ownerLabel="KEEP THIS TO YOURSELF." tone="paper" kind="rule" variant="deal" interactive initiallyRevealed={false} onRevealChange={setRevealed} /><GameButton className="rule-acknowledge" disabled={!revealed || pending || connection !== "connected"} onClick={() => void client.acknowledgeRule()}>{revealed ? "I’VE GOT IT" : "REVEAL YOUR SECRET FIRST"}</GameButton></GameModal>;
}

function SecretDrawer({ state }: { state: PrivatePlayerRoundState }) {
  const [open, setOpen] = useState(false);
  return <div className="secret-drawer" data-open={open}><button aria-expanded={open} onClick={() => setOpen(!open)}><GameIcon name="secret" size={18} /> {open ? "HIDE SECRET" : "VIEW SECRET"}<span>PRIVATE</span></button>{open && <div className="secret-drawer__card"><SecretCard rule={state.secretRule.description} ownerLabel="YOU / PRIVATE" tone="paper" kind="rule" /><div className="secret-progress"><span>{state.privateProgress.summary}</span></div></div>}</div>;
}

function participant(round: PublicRoundState, players: readonly PublicPlayer[], playerId: string) {
  const player = players.find((candidate) => candidate.playerId === playerId);
  return { name: player?.displayName ?? round.reveal?.entries.find((entry) => entry.playerId === playerId)?.displayName ?? "DEPARTED PLAYER", avatarId: player?.avatarId ?? "lime" as const, tone: player?.playerColor ?? "spectator" as const };
}

function Standings({ round, players, final = false }: { round: PublicRoundState; players: readonly PublicPlayer[]; final?: boolean }) {
  const standings = final ? round.matchResult?.finalStandings ?? [] : round.roundScore?.standings ?? [];
  return <section className="match-standings"><p className="eyebrow">{final ? "THE FINAL TABLE." : "THE TABLE SO FAR."}</p><h3>{final ? "FINAL STANDINGS" : "STANDINGS"}</h3><ol>{standings.map((standing) => { const profile = participant(round, players, standing.playerId); return <li key={standing.playerId}><strong>{standing.rank}</strong><PlayerBadge name={profile.name} avatarId={profile.avatarId} tone={profile.tone} compact /><span>{standing.score}</span></li>; })}</ol></section>;
}

function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function RoundScores({ round, players }: { round: PublicRoundState; players: readonly PublicPlayer[] }) {
  if (!round.roundScore) return null;
  return <section className="round-scores"><p className="eyebrow">POINTS ARE PUBLIC NOW.</p><h3>ROUND {round.roundNumber} BREAKDOWN</h3><div className="round-scores__grid">{round.roundScore.entries.map((entry) => { const profile = participant(round, players, entry.playerId); return <article key={entry.playerId}><PlayerBadge name={profile.name} avatarId={profile.avatarId} tone={profile.tone} compact /><dl>
    <div><dt>CHALLENGES</dt><dd>+{entry.challengePoints}</dd></div><div><dt>CHALLENGE PENALTIES</dt><dd>-{entry.challengePenalties}</dd></div><div><dt>TARGET REWARD</dt><dd>+{entry.targetPoints}</dd></div><div><dt>{entry.secretDifficulty.toUpperCase()} SECRET · {entry.secretRuleResult.toUpperCase()}</dt><dd>+{entry.secretPoints}</dd></div><div className="round-scores__total"><dt>ROUND TOTAL</dt><dd>{signed(entry.roundTotal)}</dd></div><div><dt>MATCH TOTAL</dt><dd>{entry.matchTotal}</dd></div>
  </dl></article>; })}</div></section>;
}

function RuleRevealCards({ round }: { round: PublicRoundState }) {
  if (!round.reveal) return null;
  return <div className="round-reveal__grid">{round.reveal.entries.map((entry, index) => <article className="rule-reveal-card" key={entry.playerId} style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}><span>{entry.displayName.toUpperCase()}’S SECRET</span><strong>{entry.publicRuleDescription}</strong><small>{entry.progressSummary}</small><em data-result={entry.status}>{entry.status.toUpperCase()}</em></article>)}</div>;
}

function RoundReveal({ round, host, players }: { round: PublicRoundState; host: boolean; players: readonly PublicPlayer[] }) {
  const { client, pending } = useMultiplayer();
  return <section className="round-reveal"><p className="eyebrow">THE TRUTH, FINALLY.</p><h2>SECRET RULES REVEALED</h2><RuleRevealCards round={round} /><RoundScores round={round} players={players} /><Standings round={round} players={players} /><div className="round-reveal__continue">{host ? <GameButton disabled={pending} onClick={() => void client.continueRound()}>NEXT ROUND <GameIcon name="arrow" size={16} /></GameButton> : <p>WAITING FOR HOST…</p>}</div></section>;
}

function MatchComplete({ round, players, host, requestLeave }: { round: PublicRoundState; players: readonly PublicPlayer[]; host: boolean; requestLeave: () => void }) {
  const { client, pending } = useMultiplayer();
  const winnerIds = round.matchResult?.winnerPlayerIds ?? [];
  const names = winnerIds.map((id) => participant(round, players, id).name.toUpperCase());
  return <section className="match-complete"><p className="eyebrow">ALL {round.totalRounds} ROUNDS ARE IN.</p><h2>MATCH COMPLETE</h2><div className="match-winners">{winnerIds.map((id) => { const profile = participant(round, players, id); return <PlayerBadge key={id} name={profile.name} avatarId={profile.avatarId} tone={profile.tone} />; })}<strong>{names.join(" & ")} {names.length > 1 ? "WIN" : "WINS"}</strong><span>{round.matchResult?.finalStandings[0]?.score ?? 0} POINTS</span></div><Standings round={round} players={players} final /><RoundScores round={round} players={players} /><details className="final-rule-reveal"><summary>VIEW FINAL ROUND SECRETS</summary><RuleRevealCards round={round} /></details><div className="match-complete__actions">{host && <GameButton disabled={pending} onClick={() => void client.returnToLobby()}>RETURN TO LOBBY</GameButton>}<GameButton variant="secondary" onClick={requestLeave}>LEAVE ROOM</GameButton>{!host && <p>THE HOST CAN RETURN THIS ROOM TO THE LOBBY.</p>}</div></section>;
}

function CardFace({ card, selected, onClick, disabled, penalty = false }: { card: ButtonCard; selected?: boolean; onClick: () => void; disabled: boolean; penalty?: boolean }) {
  return <button className="button-card" data-kind={card.kind} data-selected={selected} disabled={disabled} onClick={onClick} aria-pressed={selected}><span>{penalty ? "DISCARD" : selected ? "REAL CARD" : "PRIVATE CARD"}</span><strong>{BUTTON_CARD_LABELS[card.kind]}</strong><small>{card.kind.replaceAll("_", " ")}</small></button>;
}

function PrivateActionPanel({ round, state, players, selfId, disabled }: { round: PublicRoundState; state: PrivatePlayerRoundState; players: readonly PublicPlayer[]; selfId: string; disabled: boolean }) {
  const { client } = useMultiplayer();
  const sound = useSound();
  const selfPlayer = players.find((player) => player.playerId === selfId);
  const mobilePov = selfPlayer ? <i className="mobile-pov-label">YOUR SEAT · {selfPlayer.displayName.toUpperCase()} · FRONT / </i> : null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ButtonCardKind>("PLUS_ONE");
  const [targetId, setTargetId] = useState("");
  const isTurn = round.phase === "turn_action" && round.publicGameState.currentPlayerId === selfId;
  const selected = state.hand.find((card) => card.cardId === selectedCardId) ?? null;
  const validTargets = players.filter((player) => player.playerId !== selfId && player.connected);
  async function play() {
    if (!selected) return;
    const targeted = isTargetedButtonCard(claim);
    if (targeted && !targetId) return;
    sound.play("cardPlay");
    const ok = await client.playCard({ cardId: selected.cardId, claim, ...(targeted ? { targetPlayerId: targetId } : {}) });
    if (ok) { setSelectedCardId(null); setTargetId(""); }
  }
  if (state.pendingChoice?.kind === "penalty_discard") return <aside className="private-action-panel private-action-panel--urgent"><header><span>{mobilePov}PENALTY</span><strong>CHOOSE ONE EXTRA CARD TO DISCARD</strong><small>This card stays private and will not be replaced.</small></header><div className="private-hand">{state.hand.map((card) => <CardFace key={card.cardId} card={card} penalty disabled={disabled} onClick={() => void client.penaltyDiscard(card.cardId)} />)}</div></aside>;
  if (state.pendingChoice?.kind === "wild_value") return <aside className="private-action-panel private-action-panel--urgent"><header><span>{mobilePov}WILD · PRIVATE CHOICE</span><strong>CHOOSE THE MOVEMENT</strong></header><div className="wild-options">{([1, 2, -1, -2] as const).map((movement) => <GameButton key={movement} disabled={disabled} onClick={() => void client.chooseWild(movement)}>{movement > 0 ? `+${movement}` : movement}</GameButton>)}</div></aside>;
  if (state.pendingChoice?.kind === "target_vote") return <aside className="private-action-panel private-action-panel--vote"><header><span>{mobilePov}PRIVATE VOTE</span><strong>END THE ROUND OR CONTINUE?</strong><small>Other players cannot see your choice.</small></header><div className="wild-options"><GameButton disabled={disabled || state.pendingChoice.choice !== null} onClick={() => { sound.play("vote"); void client.voteOnTarget("end"); }}>END ROUND</GameButton><GameButton variant="secondary" disabled={disabled || state.pendingChoice.choice !== null} onClick={() => { sound.play("vote"); void client.voteOnTarget("continue"); }}>LAST CHANCE</GameButton></div>{state.pendingChoice.choice && <p>VOTE LOCKED: {state.pendingChoice.choice.toUpperCase()}</p>}</aside>;
  return <aside className="private-action-panel" data-active={isTurn}><header><span>{mobilePov}{isTurn ? "YOUR TURN" : "YOUR PRIVATE HAND"}</span><strong>{isTurn ? selected ? "WHAT DO YOU CLAIM YOU’RE PLAYING?" : "CHOOSE YOUR REAL CARD" : `${state.hand.length} CARDS`}</strong><small>{isTurn ? "Your real selection never leaves your private state." : "Wait for your seat to light up."}</small></header><div className="private-hand">{state.hand.map((card) => <CardFace key={card.cardId} card={card} selected={card.cardId === selectedCardId} disabled={disabled || !isTurn} onClick={() => setSelectedCardId(card.cardId)} />)}</div>
    {isTurn && selected && <div className="claim-builder"><label>PUBLIC CLAIM<select value={claim} onChange={(event) => { const next = event.target.value as ButtonCardKind; setClaim(next); if (!isTargetedButtonCard(next)) setTargetId(""); }}>{BUTTON_CARD_KINDS.map((kind) => <option key={kind} value={kind}>{BUTTON_CARD_LABELS[kind]} · {kind.replaceAll("_", " ")}</option>)}</select></label>{isTargetedButtonCard(claim) && <label>CLAIM TARGET<select required value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">CHOOSE PLAYER</option>{validTargets.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName.toUpperCase()}</option>)}</select></label>}<GameButton disabled={disabled || isTargetedButtonCard(claim) && !targetId} onClick={() => void play()}>PLAY FACE DOWN</GameButton></div>}
    {isTurn && round.publicGameState.basicActionAvailable && <GameButton className="basic-button-action" variant="secondary" disabled={disabled} onClick={() => void client.basicButton()}>BASIC BUTTON +1</GameButton>}
    {state.inspections.length > 0 && <details className="inspection-log"><summary>PRIVATE INSPECTIONS · {state.inspections.length}</summary>{state.inspections.map((item) => <p key={item.knowledgeId}>{players.find((player) => player.playerId === item.targetPlayerId)?.displayName ?? "PLAYER"}: <strong>{BUTTON_CARD_LABELS[item.card]}</strong></p>)}</details>}
  </aside>;
}

function PublicBoard({ round, players, selfId, spectator, disabled }: { round: PublicRoundState; players: readonly PublicPlayer[]; selfId: string | null; spectator: boolean; disabled: boolean }) {
  const { client } = useMultiplayer();
  const sound = useSound();
  const game = round.publicGameState;
  const claim = game.currentClaim;
  const actor = claim ? participant(round, players, claim.actorPlayerId).name : null;
  const target = claim?.targetPlayerId ? participant(round, players, claim.targetPlayerId).name : null;
  const canChallenge = round.phase === "challenge" && Boolean(selfId && claim && claim.actorPlayerId !== selfId) && !spectator;
  const challenge = game.challenge;
  return <section className="v2-board" aria-label="Public Button V2 state">
    <div className="v2-deck"><span>DRAW DECK</span><i aria-hidden="true" /><strong>{game.deckRemaining}</strong></div><div className="v2-discard"><span>DISCARD</span><i aria-hidden="true" /><strong>{game.discardCount}</strong></div>
    <div className="v2-counter"><span>BUTTON</span><strong aria-live="polite">{game.counter}</strong><small>EXACT TARGET <b>{game.target}</b></small><button className="v2-red-button" tabIndex={-1} aria-hidden="true"><i /></button></div>
    <div className="v2-direction" data-direction={game.direction}><span>↻</span>{game.direction.replace("_", " ").toUpperCase()}</div>
    <div className="v2-play-zone" data-active={Boolean(claim)}>{claim ? <><div className="face-down-card" data-revealed={Boolean(challenge?.revealedCard)}><span>{challenge?.revealedCard ? BUTTON_CARD_LABELS[challenge.revealedCard] : "?"}</span></div><p><b>{actor?.toUpperCase()}</b> CLAIMS <strong>{BUTTON_CARD_LABELS[claim.claim]}</strong>{target && <> → <b>{target.toUpperCase()}</b></>}</p>{challenge?.outcome && <div className="challenge-result" data-outcome={challenge.outcome}><strong>{challenge.outcome === "bluff_caught" ? "BLUFF CAUGHT" : "FALSE ACCUSATION"}</strong><span>ACTUAL {challenge.revealedCard ? BUTTON_CARD_LABELS[challenge.revealedCard] : "—"} · CLAIM {BUTTON_CARD_LABELS[claim.claim]}</span></div>}</> : <><div className="face-down-card face-down-card--empty"><span>?</span></div><p>WAITING FOR A CARD</p></>}
      {canChallenge && <GameButton className="call-bluff" variant="danger" disabled={disabled} onClick={() => { sound.play("callBluff"); void client.callBluff(); }}>CALL BLUFF</GameButton>}
    </div>
    {game.lastEffect && <div className="v2-effect" role="status"><span>{game.lastEffect.type.replaceAll("_", " ").toUpperCase()}</span><strong>{game.lastEffect.movement === null ? "RESOLVED" : signed(game.lastEffect.movement)}</strong><small>{game.lastEffect.counterBefore} → {game.lastEffect.counterAfter}</small></div>}
    {game.targetSecured && <div className="target-secured"><strong>TARGET SECURED</strong><span>THE COUNTER IS LOCKED AT {game.target}</span></div>}
    {round.phase === "last_chance" && <div className="last-chance-banner">LAST CHANCE · {game.lastChanceTurnsRemaining} TURNS REMAIN</div>}
  </section>;
}

export function GameShell() {
  const { room } = useMultiplayer();
  return room?.publicRound ? <ActiveGameShell /> : null;
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
  const round = room!.publicRound!;
  const [helpOpen, setHelpOpen] = useState(round.roundNumber === 1 && round.phase === "rule_ack");
  const now = useServerClock(round);
  const me = room!.players.find((player) => player.playerId === playerId);
  const players = room!.players.filter((player) => player.role === "player");
  const spectator = me?.role === "spectator";
  const remainingMs = round.publicTimer ? Math.max(0, round.publicTimer.deadlineAt - now) : 0;
  const timerTension = remainingMs <= 3_000 ? "critical" : remainingMs <= 7_000 ? "urgent" : "normal";
  const countdown = round.countdownEndsAt ? Math.max(0, Math.ceil((round.countdownEndsAt - now) / 1000)) : 0;
  const acknowledged = useMemo(() => new Set(round.publicPlayerStatuses.filter((status) => status.acknowledged).map((status) => status.playerId)), [round.publicPlayerStatuses]);
  const previousPhase = useRef(round.phase);
  const previousEffect = useRef(round.publicGameState.lastEffect?.effectId ?? null);
  useEffect(() => {
    if (previousPhase.current !== round.phase) {
      if (round.phase === "challenge_reveal") sound.play(round.publicGameState.challenge?.outcome === "bluff_caught" ? "bluffCaught" : "falseAccusation");
      if (round.phase === "target_vote") sound.play("targetReached");
      if (round.phase === "round_reveal") sound.play("secretReveal");
      if (round.phase === "match_complete") sound.play("matchComplete");
      previousPhase.current = round.phase;
    }
    const effect = round.publicGameState.lastEffect;
    if (effect && effect.effectId !== previousEffect.current) {
      if (effect.type === "shield" || effect.type === "shield_blocked") sound.play("shield");
      else if (effect.type === "reverse") sound.play("reverse");
      else sound.play("counterTick");
      previousEffect.current = effect.effectId;
    }
  }, [round.phase, round.publicGameState.challenge?.outcome, round.publicGameState.lastEffect, sound]);
  async function leave() { if (await client.leave()) router.push("/"); }
  const recent = round.publicEvents.slice(-4);
  const eventFeed = <aside className="public-feed" aria-label="Recent table actions" aria-live="polite"><span className="public-feed__title">TABLE LOG</span>{recent.map((event) => <span key={event.eventId}><b>{event.actorPlayerId ? participant(round, players, event.actorPlayerId).name.toUpperCase() : "TABLE"}</b> {event.type.replaceAll("_", " ")}</span>)}</aside>;
  const showError = error !== null;
  return <div className="game-shell game-shell--v2" data-reduce-motion={reducedMotion} data-chat-open={chatOpen}>
    <a className="skip-link" href="#private-actions">Skip to your cards</a>
    <header className="game-hud"><FullLogo className="game-hud__logo" /><span className="game-hud__round">ROUND {round.roundNumber} / {round.totalRounds}</span><div className="game-hud__tools"><span className="game-hud__timer" data-tension={timerTension}><GameIcon name="timer" size={17} />{round.publicTimer ? formatRemainingTime(round.publicTimer.deadlineAt, now) : round.phase.replaceAll("_", " ").toUpperCase()}</span><button aria-label="Game menu" onClick={() => setMenuOpen(true)}><GameIcon name="settings" /></button></div></header>
    <GameplayChat open={chatOpen} setOpen={setChatOpen} />
    <main className="game-stage"><GameTable players={players} playerId={playerId} round={round} acknowledgedPlayerIds={acknowledged} choosePlayer={setSelected} eventFeed={eventFeed}><PublicBoard round={round} players={players} selfId={playerId} spectator={Boolean(spectator)} disabled={pending || connection !== "connected"} /></GameTable>
      {helpOpen && round.roundNumber === 1 && round.phase === "rule_ack" && !spectator && <ButtonPrimer close={() => setHelpOpen(false)} />}
      {!helpOpen && round.phase === "rule_ack" && <RuleDeal round={round} privateRound={privateRound} spectator={Boolean(spectator)} />}
      {round.phase === "countdown" && <div className="countdown" role="status"><small>CARDS READY. STORIES OPTIONAL.</small><span key={countdown}>{countdown || "GO"}</span></div>}
      {round.phase === "round_reveal" && <RoundReveal round={round} players={players} host={room!.hostPlayerId === playerId} />}
      {round.phase === "match_complete" && <MatchComplete round={round} players={players} host={room!.hostPlayerId === playerId} requestLeave={() => setLeaving(true)} />}
      {privateRound && !spectator && !["rule_ack", "round_reveal", "match_complete"].includes(round.phase) && <><div id="private-actions"><PrivateActionPanel round={round} state={privateRound} players={players} selfId={playerId!} disabled={pending || connection !== "connected"} /></div><SecretDrawer state={privateRound} /></>}
      {spectator && round.phase !== "rule_ack" && <span className="spectator-chip"><GameIcon name="players" size={15} /> SPECTATING · PUBLIC VIEW ONLY</span>}
      {showError && <div className="game-error" role="alert">{ERROR_MESSAGES[error.code]}</div>}
    </main>
    {connection === "reconnecting" && <aside className="reconnect-overlay" role="status"><GameIcon name="reconnect" /><div><strong>RECONNECTING…</strong><p>Your hand, Secret, choices, and seat are held.</p></div></aside>}
    {menuOpen && <SettingsPanel connectionStatus={connection === "connected" ? "connected" : "reconnecting"} onClose={() => setMenuOpen(false)} />}
    {selected && <GameModal open title={selected.displayName.toUpperCase()} className="game-player-profile" onClose={() => setSelected(null)}><PlayerBadge name={selected.displayName} avatarId={selected.avatarId} tone={selected.playerColor ?? "spectator"} host={selected.isHost} /><p>{selected.connected ? selected.afk ? "AFK" : "AT THE TABLE" : "RECONNECTING…"}</p>{selected.playerId !== playerId && <div className="profile-actions"><GameButton variant="secondary" onClick={() => client.toggleMute(selected.playerId)}>MUTE / UNMUTE</GameButton><GameButton variant="ghost" onClick={async () => { await client.send(EVENTS.report, { targetPlayerId: selected.playerId, reason: "other", description: "Reported from gameplay profile." }); setSelected(null); }}>REPORT</GameButton></div>}</GameModal>}
    <button className="game-leave" onClick={() => setLeaving(true)}><GameIcon name="leave" size={15} /> LEAVE GAME</button>
    {leaving && <GameModal open title="LEAVE THE GAME?" description="Your active seat will be removed immediately." onClose={() => setLeaving(false)}><div className="leave-actions"><GameButton variant="secondary" onClick={() => setLeaving(false)}>STAY</GameButton><GameButton variant="danger" onClick={() => void leave()}>LEAVE</GameButton></div></GameModal>}
  </div>;
}
