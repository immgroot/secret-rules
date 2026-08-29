import { z } from "zod";

export const BUTTON_MODES = ["CLASSIC", "MAYHEM"] as const;
export const ButtonModeSchema = z.enum(BUTTON_MODES);
export type ButtonMode = z.infer<typeof ButtonModeSchema>;

// Reserved identifiers for the future Mayhem protocol. They are not playable
// commands and have no transport handlers in Phase 3.2.
export const MAYHEM_SECRET_ACTIONS = ["DOUBLE", "FREEZE", "SWAP", "REPEAT", "SHIELD", "STEAL"] as const;
export const MayhemSecretActionSchema = z.enum(MAYHEM_SECRET_ACTIONS);
export type MayhemSecretAction = z.infer<typeof MayhemSecretActionSchema>;

export const MAYHEM_PUBLIC_EVENT_TRIGGERS = ["COUNTER_MILESTONE", "TIME_MILESTONE", "SERVER_SELECTED"] as const;
export const MayhemPublicEventTriggerSchema = z.enum(MAYHEM_PUBLIC_EVENT_TRIGGERS);
export type MayhemPublicEventTrigger = z.infer<typeof MayhemPublicEventTriggerSchema>;
