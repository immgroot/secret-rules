import type { PublicPlayer } from "@secret-rules/shared";
import { BUTTON_CARD_LABELS } from "@secret-rules/shared";
import { ButtonCardArtwork } from "./button-card.tsx";
import type { PrivateEffectPresentation } from "./button-presentation.ts";

export function PrivateEffectResultContent({ effect, players }: {
  effect: PrivateEffectPresentation;
  players: readonly PublicPlayer[];
}) {
  const sourceName = players.find((player) => player.playerId === effect.playerId)?.displayName.toUpperCase() ?? "PLAYER";
  return <div className="private-effect-result__content" data-effect={effect.kind}>
    <span>{effect.kind === "inspect" ? `YOU INSPECTED ${sourceName}` : `TAKEN FROM ${sourceName}`}</span>
    <div className="private-effect-result__card"><ButtonCardArtwork kind={effect.card} /></div>
    <strong>{BUTTON_CARD_LABELS[effect.card]}</strong>
    <small>{effect.kind === "inspect" ? `THIS CARD STAYS IN ${sourceName}’S HAND.` : "ADDED TO YOUR HAND."}</small>
  </div>;
}
