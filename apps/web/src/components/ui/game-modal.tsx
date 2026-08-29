"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { GameButton } from "./game-button.tsx";
import { GameIcon } from "../icons/game-icon.tsx";

export function GameModal({ open, onClose, title, description, children, className = "", dismissible = true }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string; dismissible?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      // Programmatic cleanup must not call onClose: Strict Mode replays effects.
      // User dismissals are handled explicitly below.
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return <dialog ref={dialogRef} className={`game-modal ${className}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (dismissible) onClose(); }
    if (event.key === "Tab") {
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} onClick={(event) => {
    if (!dismissible || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="game-modal__header"><h2 id={titleId}>{title}</h2>{dismissible && <GameButton variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}><GameIcon name="close" /></GameButton>}</div>
    {description && <p className="game-modal__description" id={descriptionId}>{description}</p>}
    {children}
  </dialog>;
}
