import type { ButtonMode } from "@secret-rules/shared";

export const CLASSIC_BUTTON_MODE: ButtonMode = "CLASSIC";

export const BUTTON_MODE_CONFIG: Readonly<Record<ButtonMode, {
  playable: boolean;
  usesActionTokens: boolean;
  usesPublicEvents: boolean;
}>> = Object.freeze({
  CLASSIC: Object.freeze({ playable: true, usesActionTokens: false, usesPublicEvents: false }),
  MAYHEM: Object.freeze({ playable: false, usesActionTokens: true, usesPublicEvents: true }),
});
