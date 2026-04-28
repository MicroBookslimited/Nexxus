import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionRevocationMiddleware } from "./middleware/session-revocation";
import { subscriptionGuardMiddleware } from "./middleware/subscription-guard";

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

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", sessionRevocationMiddleware, subscriptionGuardMiddleware, router);

export default app;
