import { Router, type IRouter } from "express";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import {
  db, technicianTeamsTable, technicianTeamMembersTable, staffTable,
  workOrdersTable, assetAssignmentsTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

/**
 * Technician teams (crews). A team has one leader and any number of members;
 * it can be assigned to a work order in one pick and can hold tools from the
 * fixed-asset register. The leader gets office-style rights over their team's
 * jobs in the FSM app (see routes/fsm.ts).
 */

const router: IRouter = Router();

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const TeamBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  leaderStaffId: z.number().int().positive().nullable().optional(),
  colour: z.string().trim().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
  memberStaffIds: z.array(z.number().int().positive()).max(100).optional(),
});
const UpdateTeamBody = TeamBody.partial();

const MembersBody = z.object({
  staffIds: z.array(z.number().int().positive()).min(1).max(100),
});

/** Validates that every id belongs to this tenant's staff; returns their rows. */
async function tenantStaff(tenantId: number, ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role, isTechnician: staffTable.isTechnician, isActive: staffTable.isActive })
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenantId), inArray(staffTable.id, ids)));
}

/** Loads teams with members, leader and usage counts — all batched. */
async function loadTeams(tenantId: number, opts: { includeInactive?: boolean; teamId?: number } = {}) {
  const conds = [eq(technicianTeamsTable.tenantId, tenantId)];
  if (!opts.includeInactive) conds.push(eq(technicianTeamsTable.isActive, true));
  if (opts.teamId) conds.push(eq(technicianTeamsTable.id, opts.teamId));

  const teams = await db.select().from(technicianTeamsTable).where(and(...conds)).orderBy(asc(technicianTeamsTable.name));
  if (teams.length === 0) return [];
  const ids = teams.map((t) => t.id);

  const [members, openJobs, tools] = await Promise.all([
    db
      .select({
        teamId: technicianTeamMembersTable.teamId,
        staffId: technicianTeamMembersTable.staffId,
        name: staffTable.name,
        role: staffTable.role,
        isTechnician: staffTable.isTechnician,
        isActive: staffTable.isActive,
      })
      .from(technicianTeamMembersTable)
      .innerJoin(staffTable, eq(staffTable.id, technicianTeamMembersTable.staffId))
      .where(and(eq(technicianTeamMembersTable.tenantId, tenantId), inArray(technicianTeamMembersTable.teamId, ids)))
      .orderBy(asc(staffTable.name)),
    db
      .select({ teamId: workOrdersTable.assignedTeamId, count: sql<number>`COUNT(*)::int` })
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.tenantId, tenantId),
        inArray(workOrdersTable.assignedTeamId, ids),
        sql`${workOrdersTable.status} NOT IN ('completed','collected','cancelled')`,
      ))
      .groupBy(workOrdersTable.assignedTeamId),
    db
      .select({ teamId: assetAssignmentsTable.teamId, count: sql<number>`COUNT(*)::int` })
      .from(assetAssignmentsTable)
      .where(and(
        eq(assetAssignmentsTable.tenantId, tenantId),
        eq(assetAssignmentsTable.status, "active"),
        inArray(assetAssignmentsTable.teamId, ids),
      ))
      .groupBy(assetAssignmentsTable.teamId),
  ]);

  const membersByTeam = new Map<number, typeof members>();
  for (const m of members) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push(m);
    membersByTeam.set(m.teamId, list);
  }
  const jobsByTeam = new Map(openJobs.map((r) => [r.teamId!, Number(r.count)]));
  const toolsByTeam = new Map(tools.map((r) => [r.teamId!, Number(r.count)]));

  return teams.map((t) => {
    const list = membersByTeam.get(t.id) ?? [];
    return {
      ...t,
      members: list,
      leaderName: list.find((m) => m.staffId === t.leaderStaffId)?.name ?? null,
      memberCount: list.length,
      openJobCount: jobsByTeam.get(t.id) ?? 0,
      toolCount: toolsByTeam.get(t.id) ?? 0,
    };
  });
}

/* ─── Routes ─── */

router.get("/teams", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const includeInactive = String(req.query["includeInactive"] ?? "") === "true";
  res.json(await loadTeams(tenantId, { includeInactive }));
});

router.get("/teams/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [team] = await loadTeams(tenantId, { includeInactive: true, teamId: id });
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  res.json(team);
});

router.post("/teams", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = TeamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  // The leader is always a member of their own team.
  const memberIds = Array.from(new Set([...(b.memberStaffIds ?? []), ...(b.leaderStaffId ? [b.leaderStaffId] : [])]));
  const valid = await tenantStaff(tenantId, memberIds);
  if (valid.length !== memberIds.length) { res.status(400).json({ error: "One or more staff members were not found" }); return; }

  try {
    const team = await db.transaction(async (tx) => {
      const [created] = await tx.insert(technicianTeamsTable).values({
        tenantId,
        name: b.name,
        description: b.description || null,
        leaderStaffId: b.leaderStaffId ?? null,
        colour: b.colour || null,
        isActive: b.isActive ?? true,
      }).returning();
      if (memberIds.length) {
        await tx.insert(technicianTeamMembersTable).values(
          memberIds.map((staffId) => ({ tenantId, teamId: created!.id, staffId })),
        );
      }
      return created!;
    });
    const [full] = await loadTeams(tenantId, { includeInactive: true, teamId: team.id });
    res.status(201).json(full);
  } catch (e) {
    if (isUniqueViolation(e)) { res.status(409).json({ error: "A team with that name already exists" }); return; }
    throw e;
  }
});

router.patch("/teams/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }
  const b = parsed.data;

  const [existing] = await db.select().from(technicianTeamsTable)
    .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Team not found" }); return; }

  const nextLeader = b.leaderStaffId === undefined ? existing.leaderStaffId : b.leaderStaffId;
  const replacingMembers = b.memberStaffIds !== undefined;
  const memberIds = replacingMembers
    ? Array.from(new Set([...(b.memberStaffIds ?? []), ...(nextLeader ? [nextLeader] : [])]))
    : [];
  if (replacingMembers) {
    const valid = await tenantStaff(tenantId, memberIds);
    if (valid.length !== memberIds.length) { res.status(400).json({ error: "One or more staff members were not found" }); return; }
  } else if (nextLeader && nextLeader !== existing.leaderStaffId) {
    const valid = await tenantStaff(tenantId, [nextLeader]);
    if (valid.length !== 1) { res.status(400).json({ error: "Leader not found" }); return; }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(technicianTeamsTable).set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description || null } : {}),
        ...(b.leaderStaffId !== undefined ? { leaderStaffId: b.leaderStaffId ?? null } : {}),
        ...(b.colour !== undefined ? { colour: b.colour || null } : {}),
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
        updatedAt: new Date(),
      }).where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));

      if (replacingMembers) {
        await tx.delete(technicianTeamMembersTable)
          .where(and(eq(technicianTeamMembersTable.tenantId, tenantId), eq(technicianTeamMembersTable.teamId, id)));
        if (memberIds.length) {
          await tx.insert(technicianTeamMembersTable).values(
            memberIds.map((staffId) => ({ tenantId, teamId: id, staffId })),
          );
        }
      } else if (nextLeader && nextLeader !== existing.leaderStaffId) {
        // Promoting an outsider to leader quietly adds them to the crew.
        await tx.insert(technicianTeamMembersTable)
          .values({ tenantId, teamId: id, staffId: nextLeader })
          .onConflictDoNothing();
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) { res.status(409).json({ error: "A team with that name already exists" }); return; }
    throw e;
  }

  const [full] = await loadTeams(tenantId, { includeInactive: true, teamId: id });
  res.json(full);
});

router.post("/teams/:id/members", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = MembersBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }); return; }

  const [team] = await db.select({ id: technicianTeamsTable.id }).from(technicianTeamsTable)
    .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  const ids = Array.from(new Set(parsed.data.staffIds));
  const valid = await tenantStaff(tenantId, ids);
  if (valid.length !== ids.length) { res.status(400).json({ error: "One or more staff members were not found" }); return; }

  await db.insert(technicianTeamMembersTable)
    .values(ids.map((staffId) => ({ tenantId, teamId: id, staffId })))
    .onConflictDoNothing();

  const [full] = await loadTeams(tenantId, { includeInactive: true, teamId: id });
  res.json(full);
});

router.delete("/teams/:id/members/:staffId", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const staffId = parseInt(req.params.staffId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(staffId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [team] = await db.select().from(technicianTeamsTable)
    .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  if (team.leaderStaffId === staffId) {
    res.status(400).json({ error: "Pick a new team leader before removing this member" });
    return;
  }

  await db.delete(technicianTeamMembersTable).where(and(
    eq(technicianTeamMembersTable.tenantId, tenantId),
    eq(technicianTeamMembersTable.teamId, id),
    eq(technicianTeamMembersTable.staffId, staffId),
  ));

  const [full] = await loadTeams(tenantId, { includeInactive: true, teamId: id });
  res.json(full);
});

// Delete a team. Teams that are on jobs or holding tools are deactivated
// instead, so the history keeps its name.
router.delete("/teams/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [team] = await db.select({ id: technicianTeamsTable.id }).from(technicianTeamsTable)
    .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  const [{ jobs } = { jobs: 0 }] = await db
    .select({ jobs: sql<number>`COUNT(*)::int` })
    .from(workOrdersTable)
    .where(and(eq(workOrdersTable.tenantId, tenantId), eq(workOrdersTable.assignedTeamId, id)));
  const [{ tools } = { tools: 0 }] = await db
    .select({ tools: sql<number>`COUNT(*)::int` })
    .from(assetAssignmentsTable)
    .where(and(eq(assetAssignmentsTable.tenantId, tenantId), eq(assetAssignmentsTable.teamId, id), eq(assetAssignmentsTable.status, "active")));

  if (Number(jobs) > 0 || Number(tools) > 0) {
    await db.update(technicianTeamsTable).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
    res.json({ deactivated: true, reason: Number(tools) > 0 ? "This team is holding tools" : "This team is on work orders" });
    return;
  }

  await db.delete(technicianTeamsTable)
    .where(and(eq(technicianTeamsTable.id, id), eq(technicianTeamsTable.tenantId, tenantId)));
  res.status(204).end();
});

export default router;
