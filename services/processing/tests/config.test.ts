import { ConfigError, loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("uses defaults for everything but DATABASE_URL", () => {
    expect(loadConfig({ DATABASE_URL: "Server=db" })).toEqual({
      port: 8002,
      databaseUrl: "Server=db",
      allowedOrigin: "http://localhost:8080",
      version: "dev",
      libraryUrl: "http://library:8001",
      libraryTimeoutMs: 10000,
    });
  });

  it("reads every setting from the environment", () => {
    const config = loadConfig({
      DATABASE_URL: "Server=db",
      PORT: "9000",
      ALLOWED_ORIGIN: "https://ui.example.net",
      GIT_SHA: "abc123",
      LIBRARY_URL: "https://library.example.net/",
      LIBRARY_TIMEOUT_S: "2.5",
    });
    expect(config).toMatchObject({
      port: 9000,
      allowedOrigin: "https://ui.example.net",
      version: "abc123",
      libraryUrl: "https://library.example.net",
      libraryTimeoutMs: 2500,
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

  it.each(["0", "-1", "soon"])("rejects LIBRARY_TIMEOUT_S=%s", (value) => {
    expect(() =>
      loadConfig({ DATABASE_URL: "Server=db", LIBRARY_TIMEOUT_S: value }),
    ).toThrow("LIBRARY_TIMEOUT_S");
  });
});
