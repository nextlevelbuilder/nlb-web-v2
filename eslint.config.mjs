// ESLint 9 flat config. eslint-config-next 16 ships flat configs directly.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "coverage/**",
      "cloudflare-env.d.ts",
      "next-env.d.ts",
      "plans/**",
      "public/**",
      "scripts/migrate/dump/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Code ported from nlb-web still carries explicit `any` at Better Auth / Polar SDK boundaries.
      // Reported as warnings so they stay visible without blocking CI; new code must not add more.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default config;
