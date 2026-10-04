import nextJest from "next/jest.js";

// next/jest compiles TypeScript with the same SWC setup as the app.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import("jest").Config} */
const config = {
  testEnvironment: "node",
  // Not `roots`: coverage only sees untested files inside the roots.
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/", "<rootDir>/.next/"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  // Each test file gets its own DATA_DIR, so SQLite files never collide.
  setupFiles: ["<rootDir>/tests/setup/data-dir.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/cleanup.ts"],
  // Core logic of the two domains only, not routes or React (see ADR 4).
  collectCoverageFrom: [
    "lib/db.ts",
    "lib/library/**/*.ts",
    "lib/processing/**/*.ts",
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
  },
};

export default createJestConfig(config);
