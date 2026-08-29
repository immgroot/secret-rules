import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/.test-build/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    ".pnpm-store/**",
    ".pnpm-cache/**",
    ".local/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{js,mjs,ts,tsx}"],
    extends: [
      nextPlugin.configs["core-web-vitals"],
      reactHooks.configs.flat.recommended,
    ],
    settings: { next: { rootDir: "apps/web/" } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/web/**/*.{js,mjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@secret-rules/server",
                "@secret-rules/server/**",
                "**/apps/server/**",
                "**/server/src/**",
              ],
              message: "Web code must never import authoritative server code or private rule content. Use browser-safe shared contracts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/shared/src/**/*.{js,ts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@secret-rules/server",
                "@secret-rules/server/**",
                "@secret-rules/web",
                "@secret-rules/web/**",
                "**/apps/**",
                "node:*",
              ],
              message: "Shared contracts must be browser-safe and must not depend on either app or Node-only modules.",
            },
          ],
        },
      ],
    },
  },
]);
