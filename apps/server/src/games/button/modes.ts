import type { ButtonMode } from "@secret-rules/shared";

export const BUTTON_V2_MODE: ButtonMode = "V2";
export const BUTTON_MODE_CONFIG: Readonly<Record<ButtonMode, { playable: boolean }>> = Object.freeze({
  V2: Object.freeze({ playable: true }),
});
