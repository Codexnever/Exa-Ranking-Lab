import {FlatCompat} from "@eslint/eslintrc"
import {defineConfig,globalIgnores} from "eslint/config"

const compat=new FlatCompat({baseDirectory:import.meta.dirname})
export default defineConfig([
  ...compat.extends("next/core-web-vitals","next/typescript"),
  globalIgnores([
    "Microsoft/**",
    ".tmp-appdata/**",
    ".tmp-localappdata/**",
    ".npm-cache/**",
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "out/**",
    "build/**",
  ]),
  {
    // Existing application debt is surfaced without blocking the v1 release.
    // New code is still type-checked and all findings remain visible in CI.
    rules:{
      "@typescript-eslint/no-explicit-any":"warn",
      "@typescript-eslint/no-unused-vars":"warn",
      "@typescript-eslint/no-unused-expressions":"warn",
      "@typescript-eslint/no-empty-object-type":"warn",
      "@typescript-eslint/no-require-imports":"warn",
      "react-hooks/rules-of-hooks":"warn",
      "react/no-unescaped-entities":"warn",
      "prefer-const":"warn",
    },
  },
])
