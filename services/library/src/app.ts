import express, { type Router } from "express";
import { SERVICE_NAME, type Config } from "./config";
import { cors, errorHandler, notFound, requestLog } from "./middleware";

export type AppDependencies = {
  config: Config;
  /** True when this service can write to and read from its own database. */
  checkDatabase: () => Promise<boolean>;
  log?: (line: string) => void;
  /** The domain's routes; left out by tests that only need /health. */
  routes?: Router;
};

export function createApp({ config, checkDatabase, log, routes }: AppDependencies) {
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

  if (routes) app.use(routes);

  app.use(notFound);
  app.use(errorHandler(log));
  return app;
}
