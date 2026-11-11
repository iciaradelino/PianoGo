import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Each service under services/ has its own ESLint config.
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(["services/**"]),
]);
