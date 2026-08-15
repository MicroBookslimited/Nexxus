import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionRevocationMiddleware } from "./middleware/session-revocation";
import { subscriptionGuardMiddleware } from "./middleware/subscription-guard";
import { isDbConnectivityError, noteDbFailure } from "./lib/db-health";

// Refuse to boot in production if SESSION_SECRET is missing — otherwise the
// JWT signing helpers throughout the codebase silently fall back to a hard-
// coded development secret which would let anyone forge tenant tokens.
if (!process.env["SESSION_SECRET"] && process.env["NODE_ENV"] === "production") {
  // eslint-disable-next-line no-console
  console.error("FATAL: SESSION_SECRET must be set in production. Refusing to start.");
  process.exit(1);
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Capture raw body bytes for the Resend webhook route before the JSON parser
// consumes the stream — needed for signature verification against exact wire bytes.
app.use("/api/marketing/webhook", express.raw({ type: "application/json" }), (req: Request, _res: Response, next: NextFunction) => {
  if (Buffer.isBuffer(req.body)) {
    (req as Request & { rawBody: Buffer }).rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString("utf-8")) as unknown;
    } catch {
      req.body = {};
    }
  }
  next();
});

// Backup restore uploads carry a whole (gzip+base64) tenant dataset — allow a
// larger body on that route only.
app.use("/api/backup/restore", express.json({ limit: "200mb" }));

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", sessionRevocationMiddleware, subscriptionGuardMiddleware, router);

// Final error handler. Express 5 forwards rejected async handlers here, so a
// database outage lands as a normal error instead of an unhandled rejection.
// Connectivity failures are reported as 503 "temporarily unavailable" (a
// retry will work once the database is back) and never as fake/empty data.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const dbDown = isDbConnectivityError(err);
  if (dbDown) noteDbFailure(err);
  logger.error(
    { err, url: req.originalUrl, method: req.method },
    dbDown ? "Database unavailable while handling request" : "Unhandled request error",
  );
  res.status(dbDown ? 503 : 500).json(
    dbDown
      ? { error: "The database is temporarily unavailable. Please try again in a moment.", code: "DB_UNAVAILABLE" }
      : { error: "Internal server error" },
  );
});

export default app;
