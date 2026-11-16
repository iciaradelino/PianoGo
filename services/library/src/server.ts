import path from "node:path";
import { createApp } from "./app";
import { SERVICE_NAME, loadConfig } from "./config";
import { checkDatabase, connectDatabase } from "./db";
import { createPreviewCache } from "./library/preview";
import { createSheetRepository } from "./library/repository";
import { sheetRoutes } from "./library/routes";
import { migrate, readMigrations } from "./migrate";

// Same place relative to this file in src/ (tests) and dist/ (the image).
const migrationsDir = path.join(__dirname, "..", "migrations");

async function main() {
  const config = loadConfig();
  // Connect and migrate before listening, so the first request is only
  // answered once the schema is up to date.
  const pool = await connectDatabase(config.databaseUrl);
  await migrate(pool, readMigrations(migrationsDir));

  const sheets = createSheetRepository(pool);
  const previews = createPreviewCache(sheets.readSheetFile);
  const app = createApp({
    config,
    checkDatabase: () => checkDatabase(pool),
    routes: sheetRoutes(sheets, previews),
  });
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`${SERVICE_NAME} ${config.version} listening on port ${config.port}`);
  });

  // Container Apps and `docker compose stop` send SIGTERM before stopping.
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, closing");
    server.close(() => void pool.close());
  });
}

main().catch((error: unknown) => {
  console.error(`${SERVICE_NAME} failed to start:`, error instanceof Error ? error.message : error);
  process.exit(1);
});
