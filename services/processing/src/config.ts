export const SERVICE_NAME = "processing";

export type Config = {
  port: number;
  databaseUrl: string;
  /** The UI's origin, the only one allowed to call this service from a browser. */
  allowedOrigin: string;
  /** Git commit the image was built from, reported by /health. */
  version: string;
  /** Base URL of the library service, without a trailing slash. */
  libraryUrl: string;
  /** How long a call to the library may take before it is given up. */
  libraryTimeoutMs: number;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function port(value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ConfigError(`PORT must be a whole number from 1 to 65535.`);
  }
  return parsed;
}

function seconds(name: string, value: string | undefined, fallback: number) {
  if (value === undefined || value === "") return fallback * 1000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a number of seconds above 0.`);
  }
  return parsed * 1000;
}

/** Reads every setting from environment variables, so nothing is hardcoded. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is not set.");

  return {
    port: port(env.PORT, 8002),
    databaseUrl,
    allowedOrigin: env.ALLOWED_ORIGIN || "http://localhost:8080",
    version: env.GIT_SHA || "dev",
    libraryUrl: (env.LIBRARY_URL || "http://library:8001").replace(/\/+$/, ""),
    libraryTimeoutMs: seconds("LIBRARY_TIMEOUT_S", env.LIBRARY_TIMEOUT_S, 10),
  };
}
