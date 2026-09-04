"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, jwtClient, usernameClient } from "better-auth/client/plugins";
import type { auth } from "./server.ts";

export const authClient = createAuthClient({ plugins: [usernameClient(), jwtClient(), inferAdditionalFields<typeof auth>()] });
