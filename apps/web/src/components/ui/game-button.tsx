"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useSound } from "../../preferences/provider.tsx";

export type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "normal" | "small" | "icon";
  icon?: ReactNode;
};

export function GameButton({ variant = "primary", size = "normal", icon, className = "", children, type = "button", onClick, onPointerEnter, ...props }: GameButtonProps) {
  const sound = useSound();
  return <button type={type} className={`game-button game-button--${variant} game-button--${size} ${className}`} {...props}
    onClick={(event) => { sound.play("uiClick"); onClick?.(event); }}
    onPointerEnter={(event) => { if (!props.disabled && event.pointerType === "mouse") sound.play("uiHover"); onPointerEnter?.(event); }}
  >{icon}{children}</button>;
}
