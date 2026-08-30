import type { ReactNode } from "react";
import { BUTTON_CARD_LABELS, type ButtonCardKind } from "@secret-rules/shared";

export function RealClaimComparison({
  realCard,
  claim,
  realTargetName,
  claimTargetName,
  action,
  className = "",
}: {
  realCard: ButtonCardKind;
  claim: ButtonCardKind;
  realTargetName?: string | null;
  claimTargetName?: string | null;
  action?: ReactNode;
  className?: string;
}) {
  return <section className={`play-confirmation ${className}`} data-ready="true" aria-label="Private real card and public claim">
    <div data-visibility="private">
      <span>YOUR REAL CARD</span>
      <strong>{BUTTON_CARD_LABELS[realCard]}</strong>
      <small>PRIVATE{realTargetName ? ` · ${realTargetName.toUpperCase()}` : ""}</small>
    </div>
    <span className="play-confirmation__arrow" aria-hidden="true">→</span>
    <div data-visibility="public">
      <span>YOUR CLAIM</span>
      <strong>{BUTTON_CARD_LABELS[claim]}</strong>
      <small>PUBLIC{claimTargetName ? ` · ${claimTargetName.toUpperCase()}` : ""}</small>
    </div>
    {action}
  </section>;
}
