"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BUTTON_CARD_LABELS, ERROR_MESSAGES, EVENTS, isEffectButtonCard, isNumberButtonCard, isTargetedButtonCard,
  type ButtonCard, type NumberButtonCardKind, type PrivatePlayerRoundState, type PublicPlayer, type PublicRoundEvent, type PublicRoundState, type WildMovement,
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
import { ButtonCardChoice, ClaimCardPicker } from "./button-card.tsx";
import { currentTurnKey, eventsAfter, latestPrivateEffect, privateEffectIsVisible, shouldNotifyLocalTurn } from "./button-presentation.ts";
import { GameTable } from "./game-table.tsx";
import {
  EffectPresentationLayer,
  useEffectPresentationQueue,
  type EffectLaunch,
  type EffectPlayback,
  type EffectPresentationCue,
} from "./effect-presentation.tsx";
import { RealClaimComparison } from "./play-presentation.tsx";
import { PrivateEffectResultContent } from "./private-effect-result.tsx";
import { PublicBoardView, type TableNotice } from "./public-board.tsx";

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
  return <GameModal open title="THE BUTTON V2." description="Bluff with Numbers. Play Effects directly." className="button-primer" dismissible={false} onClose={() => {}}><div className="button-primer__rules">
    <span><strong>01</strong> START WITH 5 PRIVATE CARDS.</span><span><strong>02</strong> FOLLOW YOUR PRIVATE SECRET.</span>
    <span><strong>03</strong> NUMBER CARDS ARE PLAYED FACE-DOWN.</span><span><strong>04</strong> CLAIM ANY NUMBER.</span>
    <span><strong>05</strong> OPPONENTS MAY CALL BLUFF.</span><span><strong>06</strong> EFFECT CARDS PLAY FACE-UP.</span>
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

function CardFace({ card, selected = false, onClick, disabled, penalty = false }: { card: ButtonCard; selected?: boolean; onClick: () => void; disabled: boolean; penalty?: boolean }) {
  return <ButtonCardChoice kind={card.kind} purpose={penalty ? "discard" : "real"} selected={selected} disabled={disabled} data-private-card-id={card.cardId} onClick={onClick} />;
}

export function PrivateEffectResult({ state, players, presentation = null }: { state: PrivatePlayerRoundState; players: readonly PublicPlayer[]; presentation?: EffectPlayback | null }) {
  const latest = latestPrivateEffect(state);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (!privateEffectIsVisible(latest, dismissedId)) return null;
  const matchingPresentation = presentation && presentation.effect.actorPlayerId === state.playerId && presentation.effect.type === latest.kind ? presentation : null;
  if (matchingPresentation && !["activate", "result", "exit"].includes(matchingPresentation.phase)) return null;
  const dismiss = () => setDismissedId(latest.id);
  return <aside className={`private-effect-result private-effect-result--${latest.kind}`} data-phase={matchingPresentation?.phase ?? "restored"} role="status" aria-label={`${latest.kind === "inspect" ? "Inspect result" : "Stolen card"}. Private, only you can see this.`}>
    <header><span>PRIVATE · ONLY YOU CAN SEE THIS</span><strong>{latest.kind === "inspect" ? "INSPECT RESULT" : "CARD STOLEN"}</strong></header>
    <PrivateEffectResultContent effect={latest} players={players} />
    <GameButton size="small" onClick={dismiss}>GOT IT</GameButton>
  </aside>;
}

function PrivateActionPanel({ round, state, players, selfId, disabled, onEffectIntent }: { round: PublicRoundState; state: PrivatePlayerRoundState; players: readonly PublicPlayer[]; selfId: string; disabled: boolean; onEffectIntent: (launch: EffectLaunch | null) => void }) {
  const { client } = useMultiplayer();
  const sound = useSound();
  const selfPlayer = players.find((player) => player.playerId === selfId);
  const mobilePov = selfPlayer ? <i className="mobile-pov-label">YOUR SEAT · {selfPlayer.displayName.toUpperCase()} · FRONT / </i> : null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [claim, setClaim] = useState<NumberButtonCardKind | null>(null);
  const [effectTargetId, setEffectTargetId] = useState("");
  const [wildMovement, setWildMovement] = useState<WildMovement | null>(null);
  const [selectionTurnKey, setSelectionTurnKey] = useState<string | null>(null);
  const isTurn = round.phase === "turn_action" && round.publicGameState.currentPlayerId === selfId;
  const actionTurnKey = currentTurnKey(round);
  const selectionCurrent = actionTurnKey !== null && selectionTurnKey === actionTurnKey;
  const selected = state.hand.find((card) => card.cardId === (selectionCurrent ? selectedCardId : null)) ?? null;
  const validTargets = players.filter((player) => player.role === "player" && player.playerId !== selfId &&
    (!selected || !["INSPECT", "STEAL"].includes(selected.kind) || (round.publicGameState.handCounts.find((entry) => entry.playerId === player.playerId)?.count ?? 0) > 0));
  const numberSelected = selected ? isNumberButtonCard(selected.kind) : false;
  const effectSelected = selected ? isEffectButtonCard(selected.kind) : false;
  const targetedEffectSelected = selected ? isTargetedButtonCard(selected.kind) : false;
  const readyToPlay = Boolean(selected && (numberSelected ? claim : effectSelected && (!targetedEffectSelected || effectTargetId) && (selected.kind !== "WILD" || wildMovement !== null)));
  const flow = !selected ? "real" : numberSelected && !claim ? "claim" : targetedEffectSelected && !effectTargetId ? "effect-target" : selected.kind === "WILD" && wildMovement === null ? "wild-choice" : "confirm";

  function selectRealCard(cardId: string) {
    sound.play("cardSlide");
    setSelectionTurnKey(actionTurnKey);
    setSelectedCardId(cardId);
    setClaim(null);
    setEffectTargetId("");
    setWildMovement(null);
  }

  function selectClaim(kind: NumberButtonCardKind) {
    sound.play("cardSlide");
    setClaim(kind);
  }

  async function play() {
    if (!selected || !readyToPlay) return;
    if (isEffectButtonCard(selected.kind)) {
      const element = document.querySelector(`[data-private-card-id="${selected.cardId}"]`);
      const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
      onEffectIntent(rect ? { cardId: selected.cardId, card: selected.kind, rect: {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2,
      } } : null);
    }
    const ok = isNumberButtonCard(selected.kind)
      ? claim !== null && await client.playCard({ playType: "number", cardId: selected.cardId, claim })
      : isEffectButtonCard(selected.kind) && await client.playCard({
        playType: "effect", cardId: selected.cardId,
        ...(isTargetedButtonCard(selected.kind) ? { targetPlayerId: effectTargetId } : {}),
        ...(selected.kind === "WILD" && wildMovement !== null ? { movement: wildMovement } : {}),
      });
    if (ok) { setSelectedCardId(null); setClaim(null); setEffectTargetId(""); setWildMovement(null); setSelectionTurnKey(null); }
    else if (isEffectButtonCard(selected.kind)) onEffectIntent(null);
  }

  if (state.pendingChoice?.kind === "penalty_discard") return <aside className="private-action-panel private-action-panel--urgent"><header><span>{mobilePov}PENALTY · PRIVATE</span><strong>CHOOSE ONE EXTRA CARD TO DISCARD</strong><small>This card stays private and will not be replaced.</small></header><div className="private-hand">{state.hand.map((card) => <CardFace key={card.cardId} card={card} penalty disabled={disabled} onClick={() => void client.penaltyDiscard(card.cardId)} />)}</div></aside>;
  if (state.pendingChoice?.kind === "target_vote") return <aside className="private-action-panel private-action-panel--vote"><header><span>{mobilePov}PRIVATE VOTE</span><strong>END THE ROUND OR CONTINUE?</strong><small>Other players cannot see your choice.</small></header><div className="wild-options"><GameButton disabled={disabled || state.pendingChoice.choice !== null} onClick={() => { sound.play("vote"); void client.voteOnTarget("end"); }}>END ROUND</GameButton><GameButton variant="secondary" disabled={disabled || state.pendingChoice.choice !== null} onClick={() => { sound.play("vote"); void client.voteOnTarget("continue"); }}>LAST CHANCE</GameButton></div>{state.pendingChoice.choice && <p>VOTE LOCKED: {state.pendingChoice.choice.toUpperCase()}</p>}</aside>;

  return <aside className="private-action-panel" data-active={isTurn} data-flow={isTurn ? flow : "waiting"} data-card-type={effectSelected ? "effect" : numberSelected ? "number" : "none"}>
    <header className="private-action-panel__heading"><span>{mobilePov}{isTurn ? "YOUR TURN · CHOOSE A CARD" : "YOUR PRIVATE HAND"}</span><strong>{isTurn ? !selected ? "CHOOSE YOUR CARD" : numberSelected && !claim ? "WHAT DO YOU CLAIM?" : targetedEffectSelected && !effectTargetId ? `CHOOSE A PLAYER TO ${BUTTON_CARD_LABELS[selected.kind]}` : selected.kind === "WILD" && wildMovement === null ? "CHOOSE WILD VALUE" : numberSelected ? "PLAY FACE-DOWN" : `PLAY ${BUTTON_CARD_LABELS[selected.kind]}` : `${state.hand.length} CARDS`}</strong><small>{isTurn ? numberSelected ? "Number Cards stay hidden and can be bluffed." : selected ? "Effect Cards play face-up and activate directly." : "Numbers bluff. Effects act directly." : "Wait for your seat and turn banner to light up."}</small></header>
    <section className="real-card-stage" aria-labelledby="real-card-heading"><div className="private-stage-label"><span id="real-card-heading">{selected ? `YOUR HAND · ${Math.max(0, state.hand.length - 1)} OTHER CARDS` : "YOUR PRIVATE HAND"}</span>{selected && <b>{numberSelected ? "YOUR REAL CARD · PRIVATE" : "SELECTED EFFECT · FACE-UP"}</b>}</div><div className="private-hand">{state.hand.map((card) => <CardFace key={card.cardId} card={card} selected={card.cardId === selectedCardId} disabled={disabled || !isTurn} onClick={() => selectRealCard(card.cardId)} />)}</div></section>
    {isTurn && selected && targetedEffectSelected && <section className="target-picker target-picker--effect" aria-labelledby="effect-target-picker-heading"><div><span>DIRECT EFFECT</span><strong id="effect-target-picker-heading">CHOOSE A PLAYER TO {BUTTON_CARD_LABELS[selected.kind]}</strong><small>This target becomes public when the Effect is played.</small></div><div role="group" aria-label={`Choose a player to ${BUTTON_CARD_LABELS[selected.kind]}`}>{validTargets.map((player) => <button type="button" key={player.playerId} data-player-id={player.playerId} data-selected={effectTargetId === player.playerId} aria-pressed={effectTargetId === player.playerId} disabled={disabled} onClick={() => { sound.play("uiClick"); setEffectTargetId(player.playerId); }}><PlayerBadge name={player.displayName} avatarId={player.avatarId} tone={player.playerColor ?? "spectator"} compact /><span>{effectTargetId === player.playerId ? "TARGET SELECTED" : player.connected ? "SELECT TARGET" : "RECONNECTING"}</span></button>)}{validTargets.length === 0 && <p className="target-picker__empty">NO ELIGIBLE TARGETS · CHOOSE ANOTHER CARD</p>}</div></section>}
    {isTurn && selected && numberSelected && <section className="claim-stage" aria-labelledby="claim-stage-heading"><div className="claim-stage__heading"><div><span>NUMBER CARD · PUBLIC STORY</span><strong id="claim-stage-heading">WHAT DO YOU CLAIM?</strong></div><div className="real-card-summary"><span>YOUR REAL CARD · PRIVATE</span><strong>{BUTTON_CARD_LABELS[selected.kind]}</strong></div></div><ClaimCardPicker value={claim} disabled={disabled} onSelect={selectClaim} /></section>}
    {isTurn && selected?.kind === "WILD" && <section className="wild-direct-choice" aria-labelledby="wild-choice-heading"><div><span>DIRECT EFFECT</span><strong id="wild-choice-heading">CHOOSE WILD VALUE</strong><small>This is the entire Button movement. WILD gets no extra +1.</small></div><div className="wild-options" role="group" aria-label="Choose Wild Button movement">{([1, 2, -1, -2] as const).map((movement) => <GameButton key={movement} variant={wildMovement === movement ? "secondary" : "ghost"} aria-pressed={wildMovement === movement} disabled={disabled} onClick={() => { sound.play("uiClick"); setWildMovement(movement); }}>{movement > 0 ? `+${movement}` : movement}</GameButton>)}</div></section>}
    {isTurn && selected && isNumberButtonCard(selected.kind) && claim && <RealClaimComparison
      realCard={selected.kind}
      claim={claim}
      action={<GameButton disabled={disabled || !readyToPlay} onClick={() => void play()}>PLAY FACE-DOWN <GameIcon name="play" size={16} /></GameButton>}
    />}
    {isTurn && selected && effectSelected && <section className="direct-effect-confirmation" data-ready={readyToPlay}><div><span>DIRECT ACTION · FACE-UP</span><strong>{BUTTON_CARD_LABELS[selected.kind]}</strong><small>{targetedEffectSelected ? effectTargetId ? `TARGET · ${players.find((player) => player.playerId === effectTargetId)?.displayName.toUpperCase() ?? "PLAYER"}` : "CHOOSE A TARGET" : selected.kind === "WILD" ? wildMovement === null ? "CHOOSE A VALUE" : `BUTTON ${wildMovement > 0 ? "+" : ""}${wildMovement}` : "NO TARGET NEEDED"}</small></div><GameButton disabled={disabled || !readyToPlay} onClick={() => void play()}>PLAY {BUTTON_CARD_LABELS[selected.kind]} FACE-UP <GameIcon name="play" size={16} /></GameButton></section>}
    {isTurn && round.publicGameState.basicActionAvailable && <GameButton className="basic-button-action" variant="secondary" disabled={disabled} onClick={() => void client.basicButton()}>BASIC BUTTON +1</GameButton>}
    {state.inspections.length > 0 && <details className="inspection-log"><summary>PRIVATE INSPECTIONS · {state.inspections.length}</summary>{state.inspections.map((item) => <p key={item.knowledgeId}>{players.find((player) => player.playerId === item.targetPlayerId)?.displayName ?? "PLAYER"}: <strong>{BUTTON_CARD_LABELS[item.card]}</strong></p>)}</details>}
  </aside>;
}

function publicEventAction(event: PublicRoundEvent) {
  switch (event.type) {
    case "CARD_PLAYED": return `PLAYED A CARD · CLAIMED ${event.claim ? BUTTON_CARD_LABELS[event.claim] : "—"}`;
    case "EFFECT_PLAYED": return `PLAYED ${event.revealedCard ? BUTTON_CARD_LABELS[event.revealedCard] : "AN EFFECT"}${event.targetPlayerId ? " ON A PLAYER" : ""}`;
    case "CHALLENGE_CALLED": return "CALLED BLUFF";
    case "BLUFF_CAUGHT": return "BLUFF CAUGHT";
    case "FALSE_ACCUSATION": return "FALSE ACCUSATION";
    case "NO_CHALLENGE": return "THE TABLE TRUSTED IT";
    case "EFFECT_RESOLVED": return `RESOLVED A CARD${event.movement ? ` · ${signed(event.movement)}` : ""}`;
    case "TARGET_SECURED": return "HIT THE EXACT TARGET";
    case "TURN_STARTED": return "STARTED THEIR TURN";
    case "TURN_SKIPPED": return "LOST THEIR TURN";
    case "PENALTY_DISCARDED": return "DISCARDED A PENALTY CARD";
    default: return event.type.replaceAll("_", " ");
  }
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
  const [localTurnNotice, setLocalTurnNotice] = useState<string | null>(null);
  const [tableNotice, setTableNotice] = useState<TableNotice | null>(null);
  const round = room!.publicRound!;
  const effectQueue = useEffectPresentationQueue({ roundId: round.roundId, reducedMotion });
  const effectPresentation = effectQueue.active;
  const enqueueEffect = effectQueue.enqueue;
  const [helpOpen, setHelpOpen] = useState(round.roundNumber === 1 && round.phase === "rule_ack");
  const now = useServerClock(round);
  const me = room!.players.find((player) => player.playerId === playerId);
  const players = useMemo(() => room!.players.filter((player) => player.role === "player"), [room]);
  const spectator = me?.role === "spectator";
  const remainingMs = round.publicTimer ? Math.max(0, round.publicTimer.deadlineAt - now) : 0;
  const timerTension = remainingMs <= 3_000 ? "critical" : remainingMs <= 7_000 ? "urgent" : "normal";
  const countdown = round.countdownEndsAt ? Math.max(0, Math.ceil((round.countdownEndsAt - now) / 1000)) : 0;
  const acknowledged = useMemo(() => new Set(round.publicPlayerStatuses.filter((status) => status.acknowledged).map((status) => status.playerId)), [round.publicPlayerStatuses]);
  const turnKey = currentTurnKey(round);
  const previousTurnKey = useRef(turnKey);
  const previousPublicEventId = useRef(round.publicEvents.at(-1)?.eventId ?? null);
  const localTurnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPhase = useRef(round.phase);
  const previousPresentedEffect = useRef(round.publicGameState.lastEffect?.effectId ?? null);
  const pendingEffectLaunch = useRef<EffectLaunch | null>(null);
  useLayoutEffect(() => {
    const effect = round.publicGameState.lastEffect;
    if (!effect || effect.effectId === previousPresentedEffect.current || !effect.card || !isEffectButtonCard(effect.card)) return;
    const launch = pendingEffectLaunch.current;
    const origin = effect.actorPlayerId === playerId && launch?.card === effect.card ? launch.rect : null;
    enqueueEffect({ ...effect, card: effect.card }, origin);
    pendingEffectLaunch.current = null;
    previousPresentedEffect.current = effect.effectId;
  }, [enqueueEffect, playerId, round.publicGameState.lastEffect]);
  const playEffectCue = useCallback((cue: EffectPresentationCue) => {
    if (cue === "cardLand") sound.play("cardPlay");
    else if (cue === "inspectReveal") sound.play("cardFlip");
    else if (cue === "stealTransfer" || cue === "cardPickup") sound.play("cardSlide");
    else if (cue === "reverse") sound.play("reverse");
    else if (cue === "shieldArm" || cue === "shieldBlock") sound.play("shield");
    else if (cue === "skipStamp" || cue === "wildSelect") sound.play("counterTick");
  }, [sound]);
  useEffect(() => {
    if (shouldNotifyLocalTurn(previousTurnKey.current, turnKey, round.publicGameState.currentPlayerId, playerId)) {
      sound.play("yourTurn");
      setLocalTurnNotice(turnKey);
      if (localTurnTimer.current) clearTimeout(localTurnTimer.current);
      localTurnTimer.current = setTimeout(() => setLocalTurnNotice(null), 1_800);
    }
    previousTurnKey.current = turnKey;
  }, [playerId, round.publicGameState.currentPlayerId, sound, turnKey]);
  useEffect(() => {
    const latest = round.publicEvents.at(-1)?.eventId ?? null;
    const unseen = eventsAfter(round.publicEvents, previousPublicEventId.current);
    for (const event of unseen) {
      if (event.type === "CARD_PLAYED") {
        sound.play("cardPlay");
        setTableNotice(null);
        if (tableNoticeTimer.current) clearTimeout(tableNoticeTimer.current);
      } else if (event.type === "EFFECT_PLAYED") {
        setTableNotice(null);
        if (tableNoticeTimer.current) clearTimeout(tableNoticeTimer.current);
      }
      if (event.type === "CHALLENGE_CALLED") sound.play("callBluff");
      if (event.type === "BLUFF_CAUGHT") { sound.play("cardFlip"); sound.play("bluffCaught"); }
      if (event.type === "FALSE_ACCUSATION") { sound.play("cardFlip"); sound.play("falseAccusation"); }
      if (event.type === "TARGET_SECURED") sound.play("targetReached");
      if (event.type === "NO_CHALLENGE") {
        sound.play("cardSlide");
        setTableNotice({ title: "THE TABLE TRUSTS IT", detail: "THE REAL CARD STAYS HIDDEN.", kind: "trust" });
        if (tableNoticeTimer.current) clearTimeout(tableNoticeTimer.current);
        tableNoticeTimer.current = setTimeout(() => setTableNotice(null), 1_650);
      }
      if (event.type === "TURN_SKIPPED" && event.actorPlayerId) {
        const name = participant(round, players, event.actorPlayerId).name.toUpperCase();
        setTableNotice({ title: `${name} · SKIPPED`, detail: "ONE TURN CONSUMED · PLAY CONTINUES", kind: "skip", playerId: event.actorPlayerId });
        if (tableNoticeTimer.current) clearTimeout(tableNoticeTimer.current);
        tableNoticeTimer.current = setTimeout(() => setTableNotice(null), 1_800);
      }
    }
    previousPublicEventId.current = latest;
  }, [players, round, sound]);
  useEffect(() => () => {
    if (localTurnTimer.current) clearTimeout(localTurnTimer.current);
    if (tableNoticeTimer.current) clearTimeout(tableNoticeTimer.current);
  }, []);
  useEffect(() => {
    if (previousPhase.current !== round.phase) {
      if (round.phase === "round_reveal") sound.play("secretReveal");
      if (round.phase === "match_complete") sound.play("matchComplete");
      previousPhase.current = round.phase;
    }
  }, [round.phase, sound]);
  async function leave() { if (await client.leave()) router.push("/"); }
  const recent = round.publicEvents.slice(-5);
  const eventFeed = <aside className="public-feed" aria-label="Recent table actions" aria-live="polite"><span className="public-feed__title">TABLE LOG</span>{recent.map((event) => <span key={event.eventId}><b>{event.actorPlayerId ? participant(round, players, event.actorPlayerId).name.toUpperCase() : "TABLE"}</b> {publicEventAction(event)}</span>)}</aside>;
  const showError = error !== null;
  const showPrivateControls = privateRound && !spectator && !["rule_ack", "round_reveal", "match_complete"].includes(round.phase);
  const privateControls = showPrivateControls ? <PrivateActionPanel round={round} state={privateRound} players={players} selfId={playerId!} disabled={pending || connection !== "connected"} onEffectIntent={(launch) => { pendingEffectLaunch.current = launch; }} /> : null;
  return <div className="game-shell game-shell--v2" data-reduce-motion={reducedMotion} data-chat-open={chatOpen} data-effect-phase={effectPresentation?.phase} data-effect-kind={effectPresentation?.effect.card} data-effect-type={effectPresentation?.effect.type} data-receiving-card={effectPresentation?.effect.type === "steal" && effectPresentation.effect.actorPlayerId === playerId && effectPresentation.phase === "activate"}>
    <a className="skip-link" href="#private-actions">Skip to your cards</a>
    <header className="game-hud"><FullLogo className="game-hud__logo" /><span className="game-hud__round">ROUND {round.roundNumber} / {round.totalRounds}</span><div className="game-hud__tools"><span className="game-hud__timer" data-tension={timerTension}><GameIcon name="timer" size={17} />{round.publicTimer ? formatRemainingTime(round.publicTimer.deadlineAt, now) : round.phase.replaceAll("_", " ").toUpperCase()}</span><button aria-label="Game menu" onClick={() => setMenuOpen(true)}><GameIcon name="settings" /></button></div></header>
    <GameplayChat open={chatOpen} setOpen={setChatOpen} />
    <main className="game-stage"><GameTable players={players} playerId={playerId} round={round} acknowledgedPlayerIds={acknowledged} choosePlayer={setSelected} eventFeed={eventFeed} privateControls={privateControls} privateSecondaryAction={showPrivateControls ? <SecretDrawer state={privateRound} /> : null} effectPresentation={effectPresentation} skippedNoticePlayerId={tableNotice?.kind === "skip" ? tableNotice.playerId ?? null : null}><PublicBoardView round={round} players={players} selfId={playerId} spectator={Boolean(spectator)} disabled={pending || connection !== "connected"} now={now} tableNotice={tableNotice} effectPresentation={effectPresentation} completedEffectId={effectQueue.completedEffectId} onCallBluff={() => { sound.play("callBluff"); void client.callBluff(); }} onPassChallenge={() => { sound.play("uiClick"); void client.passChallenge(); }} /></GameTable>
      {localTurnNotice && <div key={localTurnNotice} className="local-turn-notice" role="status"><span>THE TABLE IS WAITING.</span><strong>YOUR TURN</strong></div>}
      {helpOpen && round.roundNumber === 1 && round.phase === "rule_ack" && !spectator && <ButtonPrimer close={() => setHelpOpen(false)} />}
      {!helpOpen && round.phase === "rule_ack" && <RuleDeal round={round} privateRound={privateRound} spectator={Boolean(spectator)} />}
      {round.phase === "countdown" && <div className="countdown" role="status"><small>CARDS READY. STORIES OPTIONAL.</small><span key={countdown}>{countdown || "GO"}</span></div>}
      {round.phase === "round_reveal" && <RoundReveal round={round} players={players} host={room!.hostPlayerId === playerId} />}
      {round.phase === "match_complete" && <MatchComplete round={round} players={players} host={room!.hostPlayerId === playerId} requestLeave={() => setLeaving(true)} />}
      {privateRound && !spectator && <PrivateEffectResult state={privateRound} players={players} presentation={effectPresentation} />}
      {spectator && round.phase !== "rule_ack" && <span className="spectator-chip"><GameIcon name="players" size={15} /> SPECTATING · PUBLIC VIEW ONLY</span>}
      {showError && <div className="game-error" role="alert">{ERROR_MESSAGES[error.code]}</div>}
    </main>
    {effectPresentation && <EffectPresentationLayer key={effectPresentation.effect.effectId} playback={effectPresentation} selfId={playerId} onAdvance={effectQueue.advance} onCue={playEffectCue} />}
    {connection === "reconnecting" && <aside className="reconnect-overlay" role="status"><GameIcon name="reconnect" /><div><strong>RECONNECTING…</strong><p>Your hand, Secret, choices, and seat are held.</p></div></aside>}
    {menuOpen && <SettingsPanel connectionStatus={connection === "connected" ? "connected" : "reconnecting"} onClose={() => setMenuOpen(false)} />}
    {selected && <GameModal open title={selected.displayName.toUpperCase()} className="game-player-profile" onClose={() => setSelected(null)}><PlayerBadge name={selected.displayName} avatarId={selected.avatarId} tone={selected.playerColor ?? "spectator"} host={selected.isHost} /><p>{selected.connected ? selected.afk ? "AFK" : "AT THE TABLE" : "RECONNECTING…"}</p>{selected.playerId !== playerId && <div className="profile-actions"><GameButton variant="secondary" onClick={() => client.toggleMute(selected.playerId)}>MUTE / UNMUTE</GameButton><GameButton variant="ghost" onClick={async () => { await client.send(EVENTS.report, { targetPlayerId: selected.playerId, reason: "other", description: "Reported from gameplay profile." }); setSelected(null); }}>REPORT</GameButton></div>}</GameModal>}
    <button className="game-leave" onClick={() => setLeaving(true)}><GameIcon name="leave" size={15} /> LEAVE GAME</button>
    {leaving && <GameModal open title="LEAVE THE GAME?" description="Your active seat will be removed immediately." onClose={() => setLeaving(false)}><div className="leave-actions"><GameButton variant="secondary" onClick={() => setLeaving(false)}>STAY</GameButton><GameButton variant="danger" onClick={() => void leave()}>LEAVE</GameButton></div></GameModal>}
  </div>;
}
