import { Router, type IRouter } from "express";
import {
  db,
  techniciansTable,
  technicianAssignmentsTable,
  tenantsTable,
  impersonationLogsTable,
} from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

type TechnicianTokenPayload = {
  technicianId: number;
  email: string;
  type: "technician";
};

function signTechnicianToken(id: number, email: string): string {
  const payload: TechnicianTokenPayload = { technicianId: id, email, type: "technician" };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyTechnicianToken(token: string): { technicianId: number; email: string } | null {
  try {
    const p = jwt.verify(token, getJwtSecret()) as Partial<TechnicianTokenPayload>;
    if (p.type !== "technician" || !p.technicianId || !p.email) return null;
    return { technicianId: p.technicianId, email: p.email };
  } catch {
    return null;
  }
}

function getBearer(req: { headers: { authorization?: string } }): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function requireTechnician(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: object) => void } },
): Promise<{ id: number; email: string; name: string; status: string } | null> {
  const tok = getBearer(req);
  if (!tok) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const payload = verifyTechnicianToken(tok);
  if (!payload) { res.status(401).json({ error: "Invalid technician token" }); return null; }
  const [tech] = await db.select().from(techniciansTable).where(eq(techniciansTable.id, payload.technicianId));
  if (!tech) { res.status(401).json({ error: "Technician not found" }); return null; }
  if (tech.status !== "approved") { res.status(403).json({ error: "Technician account is not approved" }); return null; }
  return { id: tech.id, email: tech.email, name: tech.name, status: tech.status };
}

/* ─── Public: register ─── */
const RegisterBody = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  phone: z.string().max(40).optional(),
});

router.post("/technician/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { name, email, password, phone } = parsed.data;
  const lowered = email.toLowerCase().trim();

  const [existing] = await db.select({ id: techniciansTable.id })
    .from(techniciansTable).where(eq(techniciansTable.email, lowered));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 10);
  const [created] = await db.insert(techniciansTable).values({
    name,
    email: lowered,
    passwordHash,
    phone,
    status: "pending",
  }).returning({ id: techniciansTable.id });

  res.status(201).json({ id: created?.id, status: "pending" });
});

/* ─── Public: login ─── */
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/technician/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const lowered = parsed.data.email.toLowerCase().trim();

  const [tech] = await db.select().from(techniciansTable).where(eq(techniciansTable.email, lowered));
  if (!tech) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const ok = await bcryptjs.compare(parsed.data.password, tech.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }

  if (tech.status === "pending") {
    res.status(403).json({ error: "Your account is awaiting approval by an administrator." });
    return;
  }
  if (tech.status === "rejected") {
    res.status(403).json({ error: "Your account application was rejected." });
    return;
  }
  if (tech.status === "suspended") {
    res.status(403).json({ error: "Your account is suspended. Contact support." });
    return;
  }
  if (tech.status !== "approved") {
    res.status(403).json({ error: "Account not active." });
    return;
  }

  await db.update(techniciansTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(techniciansTable.id, tech.id));

  const token = signTechnicianToken(tech.id, tech.email);
  res.json({
    token,
    technician: { id: tech.id, name: tech.name, email: tech.email, status: tech.status },
  });
});

/* ─── Authenticated: me ─── */
router.get("/technician/me", async (req, res): Promise<void> => {
  const tech = await requireTechnician(req as never, res as never);
  if (!tech) return;
  res.json({ technician: tech });
});

/* ─── Authenticated: list assigned tenants ─── */
router.get("/technician/tenants", async (req, res): Promise<void> => {
  const tech = await requireTechnician(req as never, res as never);
  if (!tech) return;

  const rows = await db
    .select({
      id: tenantsTable.id,
      businessName: tenantsTable.businessName,
      email: tenantsTable.email,
      ownerName: tenantsTable.ownerName,
      status: tenantsTable.status,
      country: tenantsTable.country,
      assignedAt: technicianAssignmentsTable.assignedAt,
    })
    .from(technicianAssignmentsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, technicianAssignmentsTable.tenantId))
    .where(eq(technicianAssignmentsTable.technicianId, tech.id))
    .orderBy(tenantsTable.businessName);

  res.json(rows);
});

/* ─── Authenticated: log in as an assigned tenant ─── */
router.post("/technician/tenants/:tenantId/login-as", async (req, res): Promise<void> => {
  const tech = await requireTechnician(req as never, res as never);
  if (!tech) return;

  const tenantId = parseInt(req.params["tenantId"] ?? "", 10);
  if (!Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid tenant id" }); return; }

  // Must be assigned to this tenant
  const [assignment] = await db.select({ id: technicianAssignmentsTable.id })
    .from(technicianAssignmentsTable)
    .where(and(
      eq(technicianAssignmentsTable.technicianId, tech.id),
      eq(technicianAssignmentsTable.tenantId, tenantId),
    ));
  if (!assignment) { res.status(403).json({ error: "You are not assigned to this customer" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  if (tenant.status === "suspended") { res.status(403).json({ error: "Customer account is suspended" }); return; }

  // Close any prior open impersonation session for this tenant by THIS technician
  await db.update(impersonationLogsTable)
    .set({ endedAt: new Date() })
    .where(and(
      eq(impersonationLogsTable.tenantId, tenantId),
      eq(impersonationLogsTable.actorTechnicianId, tech.id),
      isNull(impersonationLogsTable.endedAt),
    ));

  const [logRow] = await db.insert(impersonationLogsTable).values({
    superadminEmail: tech.email,
    tenantId,
    tenantEmail: tenant.email,
    businessName: tenant.businessName,
    actorType: "technician",
    actorTechnicianId: tech.id,
    actorName: tech.name,
  }).returning({ id: impersonationLogsTable.id });

  const token = jwt.sign({
    tenantId,
    email: tenant.email,
    type: "tenant",
    impersonation: true,
    impersonationLogId: logRow?.id,
    restrictedRole: "technician",
    actorType: "technician",
    actorTechnicianId: tech.id,
    actorName: tech.name,
  }, getJwtSecret(), { expiresIn: "12h" });

  res.json({
    token,
    tenant: { id: tenant.id, email: tenant.email, businessName: tenant.businessName },
    impersonationLogId: logRow?.id,
    restrictedRole: "technician",
  });
});

/* ─── Authenticated: end my own impersonation session ─── */
router.post("/technician/impersonation-end", async (req, res): Promise<void> => {
  const tech = await requireTechnician(req as never, res as never);
  if (!tech) return;

  const parsed = z.object({ logId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.json({ success: true }); return; }

  await db.update(impersonationLogsTable)
    .set({ endedAt: new Date() })
    .where(and(
      eq(impersonationLogsTable.id, parsed.data.logId),
      eq(impersonationLogsTable.actorTechnicianId, tech.id),
      isNull(impersonationLogsTable.endedAt),
    ));

  res.json({ success: true });
});

/* ─── Authenticated: my recent impersonation history (for portal display) ─── */
router.get("/technician/history", async (req, res): Promise<void> => {
  const tech = await requireTechnician(req as never, res as never);
  if (!tech) return;
  const rows = await db.select()
    .from(impersonationLogsTable)
    .where(eq(impersonationLogsTable.actorTechnicianId, tech.id))
    .orderBy(desc(impersonationLogsTable.startedAt))
    .limit(50);
  res.json(rows);
});

export default router;
