import { ConfigError, loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("uses defaults for everything but DATABASE_URL", () => {
    expect(loadConfig({ DATABASE_URL: "Server=db" })).toEqual({
      port: 8001,
      databaseUrl: "Server=db",
      allowedOrigin: "http://localhost:8080",
      version: "dev",
    });
  });

  it("reads every setting from the environment", () => {
    const config = loadConfig({
      DATABASE_URL: "Server=db",
      PORT: "9000",
      ALLOWED_ORIGIN: "https://ui.example.net",
      GIT_SHA: "abc123",
    });
    expect(config).toMatchObject({
      port: 9000,
      allowedOrigin: "https://ui.example.net",
      version: "abc123",
    });
  });

  it("refuses to start without a database", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it.each(["0", "70000", "80.5", "eighty"])("rejects PORT=%s", (value) => {
    expect(() => loadConfig({ DATABASE_URL: "Server=db", PORT: value })).toThrow(
      ConfigError,
    );
  });
});
