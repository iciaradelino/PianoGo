import type { ErrorRequestHandler, RequestHandler } from "express";

/** Logs one line per request to stdout: method, path, status and duration. */
export function requestLog(log: (line: string) => void = console.log): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  };
}

/**
 * Lets the browser call this service only from the UI's origin. Other
 * origins get no CORS headers, so the browser blocks their requests.
 */
export function cors(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    res.vary("Origin");
    if (req.headers.origin !== allowedOrigin) return next();

    res.set("Access-Control-Allow-Origin", allowedOrigin);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Answers unknown paths with JSON instead of Express's HTML page. */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found." });
};

/**
 * Answers a request body that could not be read (such as broken JSON) with
 * its 4xx status, and anything else with 500, logging it without sending the
 * stack trace.
 */
export function errorHandler(
  log: (line: string) => void = console.error,
): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "The request could not be read." });
      return;
    }
    log(`${req.method} ${req.path} failed: ${error instanceof Error ? error.stack : error}`);
    res.status(500).json({ error: "Something went wrong." });
  };
}
