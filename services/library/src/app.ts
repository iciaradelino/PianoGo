import express from "express";
import { SERVICE_NAME, type Config } from "./config";
import { cors, errorHandler, notFound, requestLog } from "./middleware";

export type AppDependencies = {
  config: Config;
  /** True when this service can write to and read from its own database. */
  checkDatabase: () => Promise<boolean>;
  log?: (line: string) => void;
};

export function createApp({ config, checkDatabase, log }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestLog(log));
  app.use(cors(config.allowedOrigin));

  // Reports only this service's own state, never the other service's.
  app.get("/health", async (_req, res) => {
    const ok = await checkDatabase();
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "error",
      service: SERVICE_NAME,
      db: ok ? "ok" : "error",
      version: config.version,
    });
  });

  // The sheet routes are added here when lib/library is ported.

  app.use(notFound);
  app.use(errorHandler(log));
  return app;
}
