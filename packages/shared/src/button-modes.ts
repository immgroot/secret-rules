import { z } from "zod";

export const BUTTON_MODES = ["V2"] as const;
export const ButtonModeSchema = z.enum(BUTTON_MODES);
export type ButtonMode = z.infer<typeof ButtonModeSchema>;
