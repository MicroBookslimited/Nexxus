import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { lastKnownDbState, pingDatabase } from "../lib/db-health";

const router: IRouter = Router();

// Liveness: is the process up? Deliberately does NOT touch the database, so a
// database outage never makes the platform think the server itself is dead.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness: can the server actually reach its database? 503 while it can't,
// so an outage is diagnosable at a glance instead of being guessed at from
// failing screens.
router.get("/readyz", async (_req, res) => {
  const ping = await pingDatabase();
  res.status(ping.ok ? 200 : 503).json({
    status: ping.ok ? "ready" : "degraded",
    database: {
      reachable: ping.ok,
      latencyMs: ping.latencyMs,
      ...(ping.error ? { error: ping.error } : {}),
      ...lastKnownDbState(),
    },
    uptimeSeconds: Math.round(process.uptime()),
  });
});

router.get("/outbound-ip", async (_req, res) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const data = await r.json() as { ip: string };
    res.json({ outboundIp: data.ip, env: process.env["NODE_ENV"] ?? "unknown" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch outbound IP" });
  }
});

export default router;
