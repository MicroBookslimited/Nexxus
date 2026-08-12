import { and, eq, gt, sql } from "drizzle-orm";
import { db, tenantAddonsTable, appSettingsTable } from "@workspace/db";

/* Work Orders is a paid add-on ($5/mo). A tenant is entitled when:
 *  - they hold a `work_orders_legacy_access` marker setting (tenants that had
 *    the module enabled before it became paid are grandfathered), or
 *  - they have a `work_orders` tenant_addons row that is active or cancelled
 *    with a current period that hasn't ended yet (cancel keeps access until
 *    the paid period runs out).
 * This is the authoritative server-side check — the `work_orders_enabled`
 * setting only controls UI visibility and must never be treated as proof of
 * payment. */
/* Deterministic catalog provisioning, run at server startup: guarantees the
 * work_orders add-on product exists on every deployment (fresh DBs included)
 * so the self-serve purchase flow always has something to sell. `on conflict
 * do nothing` preserves any price/description edits made after first seed. */
export async function seedAddonCatalog(): Promise<void> {
  await db.execute(sql`
    insert into subscription_addons (slug, name, description, price_monthly, price_annual, is_active)
    values ('work_orders', 'Work Orders', 'Repairs & field-service work order management module', 5, 50, true)
    on conflict (slug) do nothing
  `);
}

/* Idempotent grandfathering backfill, run at server startup: any tenant that
 * already has `work_orders_enabled = true` but no legacy marker AND no add-on
 * row was using the module before it became paid — grant them the
 * `work_orders_legacy_access` marker so the entitlement gate doesn't cut them off. */
export async function backfillWorkOrdersLegacyAccess(): Promise<void> {
  await db.execute(sql`
    insert into app_settings (key, tenant_id, value, updated_at)
    select replace(s.key, ':work_orders_enabled', ':work_orders_legacy_access'), s.tenant_id, 'true', now()
    from app_settings s
    where s.key like '%:work_orders_enabled' and s.value = 'true'
      and not exists (
        select 1 from tenant_addons ta
        where ta.tenant_id = s.tenant_id and ta.addon_slug = 'work_orders'
      )
    on conflict (key) do nothing
  `);
}

export async function hasWorkOrdersEntitlement(tenantId: number): Promise<boolean> {
  const [legacy] = await db.select().from(appSettingsTable)
    .where(eq(appSettingsTable.key, `${tenantId}:work_orders_legacy_access`));
  if (legacy?.value === "true") return true;

  const [addon] = await db.select().from(tenantAddonsTable).where(and(
    eq(tenantAddonsTable.tenantId, tenantId),
    eq(tenantAddonsTable.addonSlug, "work_orders"),
    gt(tenantAddonsTable.currentPeriodEnd, new Date()),
  ));
  return !!addon && (addon.status === "active" || addon.status === "cancelled");
}
