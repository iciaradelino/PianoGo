export const SERVICE_NAME = "library";

export type Config = {
  port: number;
  databaseUrl: string;
  /** The UI's origin, the only one allowed to call this service from a browser. */
  allowedOrigin: string;
  /** Git commit the image was built from, reported by /health. */
  version: string;
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

/** Reads every setting from environment variables, so nothing is hardcoded. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is not set.");

  return {
    port: port(env.PORT, 8001),
    databaseUrl,
    allowedOrigin: env.ALLOWED_ORIGIN || "http://localhost:8080",
    version: env.GIT_SHA || "dev",
  };
}
