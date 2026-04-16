import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
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
