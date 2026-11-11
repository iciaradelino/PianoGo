import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "../src/middleware";

function fakeResponse(headersSent = false) {
  const res = { headersSent, statusCode: 200, body: undefined as unknown };
  return Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.body = body;
      return this;
    },
  });
}

describe("errorHandler", () => {
  const req = { method: "GET", path: "/sheets" } as Request;

  it("logs the error and answers 500 without the stack", () => {
    const lines: string[] = [];
    const res = fakeResponse();
    errorHandler((line) => lines.push(line))(
      new Error("boom"),
      req,
      res as unknown as Response,
      jest.fn(),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong." });
    expect(lines[0]).toContain("GET /sheets failed: Error: boom");
  });

  it("hands over to Express when the response already started", () => {
    const next = jest.fn() as NextFunction;
    const error = new Error("late");
    errorHandler(() => {})(error, req, fakeResponse(true) as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
