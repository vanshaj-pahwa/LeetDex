import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The `useEffect(() => setMounted(true), [])` SSR mount-detection
      // pattern is used across the app to defer client-only UI until after
      // hydration. React Compiler's set-state-in-effect rule flags it
      // aggressively; the pattern is intentional and widely accepted.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler info-level signals; not actionable in app code.
      "react-compiler/react-compiler": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
