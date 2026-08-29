"use client";

import { useState } from "react";
import type { PrivatePlayerRoundState, PublicRoundState } from "@secret-rules/shared";
import { useMultiplayer } from "../../multiplayer/provider.tsx";
import { GameIcon } from "../icons/game-icon.tsx";
import { GameButton, GameModal, SecretCard, StatusBadge } from "../ui/index.ts";

function cardPresentation(state: PrivatePlayerRoundState) {
  if (state.secretRule.category === "private_knowledge") return { kind: "information" as const, tone: "green" as const };
  if (state.secretRule.category === "hidden_ability") return { kind: "ability" as const, tone: "violet" as const };
  return { kind: "rule" as const, tone: "paper" as const };
}

export function RuleRevealExperience({ publicRound, privateRound, spectator }: { publicRound: PublicRoundState; privateRound: PrivatePlayerRoundState | null; spectator: boolean }) {
  const { client, pending, connection } = useMultiplayer();
  const [closedRoundId, setClosedRoundId] = useState<string | null>(null);
  const [revealedRoundId, setRevealedRoundId] = useState<string | null>(null);
  const open = privateRound !== null && closedRoundId !== privateRound.roundId;
  const revealed = privateRound !== null && revealedRoundId === privateRound.roundId;
  const acknowledged = publicRound.publicPlayerStatuses.filter((status) => status.acknowledged).length;
  const presentation = privateRound ? cardPresentation(privateRound) : null;
  async function understood() { if (privateRound && await client.acknowledgeRule()) setClosedRoundId(privateRound.roundId); }

  return <>
    <section className="rule-reveal-banner" aria-labelledby="rule-reveal-heading">
      <div><p className="eyebrow">ROUND {publicRound.roundNumber} / SECRET REVEAL</p><h2 id="rule-reveal-heading">THE RULES ARE OUT.</h2><p>{publicRound.publicObjective}</p></div>
      <div className="rule-reveal-banner__status"><StatusBadge icon="secret">{acknowledged} / {publicRound.publicPlayerStatuses.length} UNDERSTOOD</StatusBadge>
        {privateRound ? <GameButton size="small" variant="secondary" onClick={() => setClosedRoundId(null)}><GameIcon name="secret" size={16} /> VIEW MY SECRET</GameButton> : <span className="rule-spectator-note"><GameIcon name="players" size={16} />{spectator ? "SPECTATORS RECEIVE PUBLIC STATE ONLY." : "WAITING FOR YOUR PRIVATE STATE…"}</span>}
      </div>
    </section>
    {privateRound && presentation && <GameModal open={open} title="YOUR PRIVATE CARD" description="Only this authenticated player received this payload." className="rule-reveal-modal" onClose={() => { if (privateRound.acknowledgedAt !== null) setClosedRoundId(privateRound.roundId); }}>
      <SecretCard key={privateRound.roundId} rule={privateRound.secretRule.description} ownerLabel="YOU / PRIVATE" tone={presentation.tone} kind={presentation.kind} interactive initiallyRevealed={false} onRevealChange={(next) => setRevealedRoundId(next ? privateRound.roundId : null)} />
      <div className="rule-private-meta"><span>{privateRound.secretRule.category.replace("_", " ").toUpperCase()}</span><span>{privateRound.secretRule.difficulty.toUpperCase()}</span><span>{privateRound.secretRule.rarity.toUpperCase()}</span></div>
      <div className="rule-private-progress"><span>PRIVATE PROGRESS</span><strong>{privateRound.privateProgress.summary}</strong>{privateRound.privateProgress.target !== null && <small>{privateRound.privateProgress.current ?? 0} / {privateRound.privateProgress.target}</small>}</div>
      {privateRound.acknowledgedAt === null ? <GameButton className="rule-understood" disabled={!revealed || pending || connection !== "connected"} onClick={() => void understood()}>{revealed ? "UNDERSTOOD" : "REVEAL YOUR CARD FIRST"}</GameButton> : <GameButton className="rule-understood" variant="secondary" onClick={() => setClosedRoundId(privateRound.roundId)}>KEEP IT SECRET</GameButton>}
    </GameModal>}
  </>;
}
