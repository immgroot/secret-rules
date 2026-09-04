import type { ReactNode } from "react";
import { BUTTON_CARD_LABELS, type NumberButtonCardKind } from "@secret-rules/shared";

export function RealClaimComparison({
  realCard,
  claim,
  action,
  className = "",
}: {
  realCard: NumberButtonCardKind;
  claim: NumberButtonCardKind;
  action?: ReactNode;
  className?: string;
}) {
  return <section className={`play-confirmation ${className}`} data-ready="true" aria-label="Private real card and public claim">
    <div data-visibility="private">
      <span>YOUR REAL CARD</span>
      <strong>{BUTTON_CARD_LABELS[realCard]}</strong>
      <small>PRIVATE · NUMBER CARD</small>
    </div>
    <span className="play-confirmation__arrow" aria-hidden="true">→</span>
    <div data-visibility="public">
      <span>YOUR CLAIM</span>
      <strong>{BUTTON_CARD_LABELS[claim]}</strong>
      <small>PUBLIC · NUMBER CLAIM</small>
    </div>
    {action}
  </section>;
}
