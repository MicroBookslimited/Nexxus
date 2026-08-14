/**
 * Zoho Books ⇄ NEXXUS customer synchronisation.
 *
 * Two-way sync without an "updated_at" column on `customers`: the mapping row
 * stores a fingerprint (hash of the NEXXUS fields we sync) plus Zoho's
 * `last_modified_time` as of the previous run. Comparing both against the
 * current values tells us which side actually changed, so a sync never echoes
 * its own writes back and forth.
 *
 * Conflict rule when BOTH sides changed: NEXXUS wins and the conflict is
 * recorded in the sync log. NEXXUS pushes edits immediately (auto-sync), so a
 * local change is in practice the newer one.
 */

import crypto from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  customersTable,
  zohoConnectionsTable,
  zohoCustomerMappingsTable,
  zohoSyncLogsTable,
  type ZohoConnection,
} from "@workspace/db";
import { decryptZohoToken, encryptZohoToken } from "./zoho-crypto";
import {
  ZohoApiError,
  ZohoBooksClient,
  isZohoRegion,
  refreshZohoAccessToken,
  type ZohoContact,
  type ZohoRegion,
} from "./zoho-client";

type Customer = typeof customersTable.$inferSelect;
type Mapping = typeof zohoCustomerMappingsTable.$inferSelect;

/** Renew the access token this long before Zoho expires it. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Zoho Books allows roughly 100 API calls per minute per organisation. A first
 * sync of a large catalogue would blow straight through that, so each run does
 * a bounded amount of write work and reports what is left for the next run.
 */
const MAX_WRITES_PER_RUN = 150;

/** Small pause between write calls to stay well inside Zoho's rate limit. */
const WRITE_DELAY_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ───────────────────────── credentials & client ───────────────────────── */

export function getZohoAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["ZOHO_CLIENT_ID"];
  const clientSecret = process.env["ZOHO_CLIENT_SECRET"];
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

export function connectionRegion(conn: ZohoConnection): ZohoRegion {
  return isZohoRegion(conn.region) ? conn.region : "com";
}

export async function getConnection(tenantId: number): Promise<ZohoConnection | undefined> {
  const [row] = await db
    .select()
    .from(zohoConnectionsTable)
    .where(eq(zohoConnectionsTable.tenantId, tenantId))
    .limit(1);
  return row;
}

// One in-flight refresh per connection, so parallel pushes don't each burn a
// token exchange (and race each other writing the cached token back).
const refreshInFlight = new Map<number, Promise<string>>();

/** Return a usable access token, refreshing (and persisting) it when stale. */
export async function getValidAccessToken(conn: ZohoConnection): Promise<string> {
  const fresh =
    conn.accessTokenEncrypted &&
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now();
  if (fresh) return decryptZohoToken(conn.accessTokenEncrypted!);

  const existing = refreshInFlight.get(conn.id);
  if (existing) return existing;

  const promise = (async () => {
    if (!conn.refreshTokenEncrypted) {
      throw new ZohoApiError("Zoho Books is not connected for this business.", 400);
    }
    const creds = getZohoAppCredentials();
    if (!creds) {
      throw new ZohoApiError("Zoho is not configured on this server.", 500);
    }
    const grant = await refreshZohoAccessToken({
      region: connectionRegion(conn),
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken: decryptZohoToken(conn.refreshTokenEncrypted),
    });
    await db
      .update(zohoConnectionsTable)
      .set({
        accessTokenEncrypted: encryptZohoToken(grant.accessToken),
        accessTokenExpiresAt: new Date(Date.now() + grant.expiresInSec * 1000),
        updatedAt: new Date(),
      })
      .where(eq(zohoConnectionsTable.id, conn.id));
    return grant.accessToken;
  })().finally(() => {
    refreshInFlight.delete(conn.id);
  });

  refreshInFlight.set(conn.id, promise);
  return promise;
}

export async function getBooksClient(conn: ZohoConnection): Promise<ZohoBooksClient> {
  const token = await getValidAccessToken(conn);
  return new ZohoBooksClient(connectionRegion(conn), token, conn.organizationId);
}

/* ───────────────────────────── field mapping ───────────────────────────── */

const clean = (value: string | null | undefined): string => (value ?? "").trim();

/** Digits-only phone form used for cross-system matching. */
export function phoneKey(value: string | null | undefined): string {
  return clean(value).replace(/[^0-9]/g, "");
}

export function emailKey(value: string | null | undefined): string {
  return clean(value).toLowerCase();
}

/** Hash of exactly the NEXXUS fields we sync — the "has the POS side changed?" test. */
export function fingerprintCustomer(c: Customer): string {
  const parts = [
    clean(c.name),
    clean(c.company),
    emailKey(c.email),
    clean(c.phone),
    clean(c.phone2),
    clean(c.address),
    clean(c.city),
    clean(c.state),
    clean(c.postalCode),
    clean(c.notes),
  ];
  return crypto.createHash("sha256").update(parts.join("\u0001")).digest("hex");
}

function splitName(name: string): { first: string; last: string } {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/**
 * Build the Zoho contact payload for a NEXXUS customer.
 *
 * PATCH SEMANTICS: a blank NEXXUS field must never wipe a populated Zoho field
 * (a POS customer captured as "name + phone" would otherwise strip the company,
 * notes and address the tenant's bookkeeper typed in Zoho). Empty values are
 * therefore omitted entirely, the billing address is merged onto whatever Zoho
 * already holds, and secondary contact people are carried through untouched —
 * Zoho REPLACES the contact_persons array with whatever we send.
 */
export function contactPayload(
  c: Customer,
  opts: { mode: "create" | "update"; existing?: ZohoContact | null } = { mode: "create" },
): Record<string, unknown> {
  const existing = opts.existing ?? null;
  const email = emailKey(c.email);
  const body: Record<string, unknown> = { contact_type: "customer" };

  const setIf = (key: string, value: string) => {
    if (value) body[key] = value;
  };

  setIf("contact_name", clean(c.name));
  setIf("company_name", clean(c.company));
  setIf("phone", clean(c.phone));
  setIf("mobile", clean(c.phone2));
  setIf("notes", clean(c.notes));
  if (email) body["email"] = email;

  // Only classify the contact on create; changing sub-type later can conflict
  // with how the tenant's accountant has the contact set up.
  if (opts.mode === "create") {
    body["customer_sub_type"] = clean(c.company) ? "business" : "individual";
  }

  // Address: local values win where present, Zoho's own values survive elsewhere.
  const localAddress: Record<string, string> = {};
  if (clean(c.address)) localAddress["address"] = clean(c.address);
  if (clean(c.city)) localAddress["city"] = clean(c.city);
  if (clean(c.state)) localAddress["state"] = clean(c.state);
  if (clean(c.postalCode)) localAddress["zip"] = clean(c.postalCode);
  if (Object.keys(localAddress).length > 0) {
    const keep: Record<string, string> = {};
    for (const [key, value] of Object.entries(existing?.billing_address ?? {})) {
      if (typeof value === "string" && value.trim()) keep[key] = value;
    }
    body["billing_address"] = { ...keep, ...localAddress };
  }

  // Primary contact person: merge local values over the existing person so we
  // never blank their email/phone, and carry every other person through as-is.
  const existingPrimary = existing ? primaryPerson(existing) : null;
  const { first, last } = splitName(c.name);
  const person: Record<string, unknown> = { is_primary_contact: true };
  if (existingPrimary?.contact_person_id) {
    person["contact_person_id"] = existingPrimary.contact_person_id;
  }
  person["first_name"] = first || clean(existingPrimary?.first_name);
  person["last_name"] = last || clean(existingPrimary?.last_name);
  const personEmail = email || emailKey(existingPrimary?.email);
  if (personEmail) person["email"] = personEmail;
  const personPhone = clean(c.phone) || clean(existingPrimary?.phone);
  if (personPhone) person["phone"] = personPhone;
  const personMobile = clean(c.phone2) || clean(existingPrimary?.mobile);
  if (personMobile) person["mobile"] = personMobile;

  const others = (existing?.contact_persons ?? [])
    .filter((p) => p.contact_person_id && p.contact_person_id !== existingPrimary?.contact_person_id)
    .map((p) => {
      const carried: Record<string, unknown> = { contact_person_id: p.contact_person_id };
      if (clean(p.first_name)) carried["first_name"] = clean(p.first_name);
      if (clean(p.last_name)) carried["last_name"] = clean(p.last_name);
      if (clean(p.email)) carried["email"] = clean(p.email);
      if (clean(p.phone)) carried["phone"] = clean(p.phone);
      if (clean(p.mobile)) carried["mobile"] = clean(p.mobile);
      return carried;
    });

  if (person["first_name"] || person["last_name"] || personEmail || personPhone || personMobile) {
    body["contact_persons"] = [person, ...others];
  }

  // Opening balance is accounting data — only ever set it when the contact is
  // first created, never on an update (that would fight the tenant's books).
  if (opts.mode === "create" && c.openingBalance > 0) {
    body["opening_balance_amount"] = c.openingBalance;
  }
  return body;
}

function primaryPerson(contact: ZohoContact) {
  return (
    contact.contact_persons?.find((p) => p.is_primary_contact) ?? contact.contact_persons?.[0] ?? null
  );
}

/** Fields a Zoho contact contributes to a NEXXUS customer. */
export function customerFieldsFromContact(contact: ZohoContact): Partial<Customer> & { name: string } {
  const person = primaryPerson(contact);
  const personName = [clean(person?.first_name), clean(person?.last_name)].filter(Boolean).join(" ");
  const name = clean(contact.contact_name) || clean(contact.company_name) || personName || "Unnamed contact";
  const addr = contact.billing_address;
  const street = [clean(addr?.address), clean(addr?.street2)].filter(Boolean).join(", ");

  return {
    name,
    company: clean(contact.company_name) || null,
    email: emailKey(contact.email) || emailKey(person?.email) || null,
    phone: clean(contact.phone) || clean(person?.phone) || null,
    phone2: clean(contact.mobile) || clean(person?.mobile) || null,
    address: street || null,
    city: clean(addr?.city) || null,
    state: clean(addr?.state) || null,
    postalCode: clean(addr?.zip) || null,
    notes: clean(contact.notes) || null,
  };
}

/**
 * Merge Zoho values onto a NEXXUS customer WITHOUT wiping data: a blank field
 * in Zoho never clears a populated field in the POS. Returns only the columns
 * that actually change, so an unchanged contact writes nothing.
 */
export function diffFromContact(
  local: Customer,
  contact: ZohoContact,
): Partial<typeof customersTable.$inferInsert> {
  const incoming = customerFieldsFromContact(contact);
  const changes: Partial<typeof customersTable.$inferInsert> = {};

  if (incoming.name && incoming.name !== local.name) changes.name = incoming.name;

  const optional: Array<keyof Pick<
    Customer,
    "company" | "email" | "phone" | "phone2" | "address" | "city" | "state" | "postalCode" | "notes"
  >> = ["company", "email", "phone", "phone2", "address", "city", "state", "postalCode", "notes"];

  for (const key of optional) {
    const next = (incoming[key] ?? null) as string | null;
    const current = (local[key] ?? null) as string | null;
    if (!next) continue; // never clear local data from a blank Zoho field
    if (next !== current) {
      (changes as Record<string, unknown>)[key] = next;
    }
  }
  return changes;
}

/* ───────────────────────── loyalty card generation ───────────────────────── */

function randomCardNumber(): string {
  let digits = "";
  for (let i = 0; i < 10; i++) digits += Math.floor(Math.random() * 10);
  return `LM${digits}`;
}

/**
 * Best-effort unique loyalty card for a customer pulled in from Zoho. Mirrors
 * the POS generator; on repeated collision we create the customer without a
 * card rather than failing the whole sync (cards are nullable).
 */
async function generateCardNumber(tenantId: number): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCardNumber();
    const [existing] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.tenantId, tenantId), eq(customersTable.cardNumber, candidate)))
      .limit(1);
    if (!existing) return candidate;
  }
  return null;
}

/* ────────────────────────────── mappings ────────────────────────────── */

async function upsertMapping(args: {
  tenantId: number;
  customerId: number;
  zohoContactId: string;
  localFingerprint: string;
  zohoLastModified: string | null;
  syncStatus?: string;
  syncError?: string | null;
}): Promise<void> {
  const now = new Date();
  // The table has TWO unique keys — (tenant, customer) and (tenant, contact).
  // Upserting on the first alone explodes when the contact is currently linked
  // to a different local customer, so release that stale link first, in the
  // same transaction, and let this customer take ownership of the contact.
  await db.transaction(async (tx) => {
    await tx
      .delete(zohoCustomerMappingsTable)
      .where(
        and(
          eq(zohoCustomerMappingsTable.tenantId, args.tenantId),
          eq(zohoCustomerMappingsTable.zohoContactId, args.zohoContactId),
          ne(zohoCustomerMappingsTable.customerId, args.customerId),
        ),
      );

    await tx
      .insert(zohoCustomerMappingsTable)
      .values({
        tenantId: args.tenantId,
        customerId: args.customerId,
        zohoContactId: args.zohoContactId,
        localFingerprint: args.localFingerprint,
        zohoLastModified: args.zohoLastModified,
        syncStatus: args.syncStatus ?? "synced",
        syncError: args.syncError ?? null,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [zohoCustomerMappingsTable.tenantId, zohoCustomerMappingsTable.customerId],
        set: {
          zohoContactId: args.zohoContactId,
          localFingerprint: args.localFingerprint,
          zohoLastModified: args.zohoLastModified,
          syncStatus: args.syncStatus ?? "synced",
          syncError: args.syncError ?? null,
          lastSyncedAt: now,
          updatedAt: now,
        },
      });
  });
}

/** Is this Zoho contact already owned by a DIFFERENT local customer? */
async function contactTakenByAnother(
  tenantId: number,
  zohoContactId: string,
  customerId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ customerId: zohoCustomerMappingsTable.customerId })
    .from(zohoCustomerMappingsTable)
    .where(
      and(
        eq(zohoCustomerMappingsTable.tenantId, tenantId),
        eq(zohoCustomerMappingsTable.zohoContactId, zohoContactId),
      ),
    )
    .limit(1);
  return !!row && row.customerId !== customerId;
}

async function markMappingError(
  tenantId: number,
  customerId: number,
  message: string,
): Promise<void> {
  await db
    .update(zohoCustomerMappingsTable)
    .set({ syncStatus: "error", syncError: message.slice(0, 500), updatedAt: new Date() })
    .where(
      and(
        eq(zohoCustomerMappingsTable.tenantId, tenantId),
        eq(zohoCustomerMappingsTable.customerId, customerId),
      ),
    );
}

/* ──────────────────────── single-customer push ──────────────────────── */

export type PushResult = { status: "created" | "updated" | "skipped"; contactId?: string; reason?: string };

/**
 * Push one NEXXUS customer to Zoho Books: adopt the matching contact if one
 * already exists (email → phone → exact name), otherwise create it.
 */
export async function pushCustomer(
  conn: ZohoConnection,
  client: ZohoBooksClient,
  customer: Customer,
  mapping?: Mapping | null,
): Promise<PushResult> {
  const fingerprint = fingerprintCustomer(customer);

  // Already mapped: update in place, but skip when nothing changed locally.
  if (mapping?.zohoContactId) {
    if (mapping.localFingerprint === fingerprint && mapping.syncStatus === "synced") {
      return { status: "skipped", contactId: mapping.zohoContactId, reason: "unchanged" };
    }
    const existing = await client.getContact(mapping.zohoContactId);
    if (existing) {
      const updated = await client.updateContact(
        mapping.zohoContactId,
        contactPayload(customer, { primaryContactPersonId: primaryPerson(existing)?.contact_person_id ?? null }),
      );
      await upsertMapping({
        tenantId: conn.tenantId,
        customerId: customer.id,
        zohoContactId: mapping.zohoContactId,
        localFingerprint: fingerprint,
        zohoLastModified: updated.last_modified_time ?? null,
      });
      return { status: "updated", contactId: mapping.zohoContactId };
    }
    // Contact vanished in Zoho (deleted there) — fall through and recreate.
  }

  // Not mapped yet: try to adopt an existing Zoho contact before creating one.
  const adopted = await findExistingContact(client, customer);
  if (adopted) {
    const updated = await client.updateContact(
      adopted.contact_id,
      contactPayload(customer, { primaryContactPersonId: primaryPerson(adopted)?.contact_person_id ?? null }),
    );
    await upsertMapping({
      tenantId: conn.tenantId,
      customerId: customer.id,
      zohoContactId: adopted.contact_id,
      localFingerprint: fingerprint,
      zohoLastModified: updated.last_modified_time ?? null,
    });
    return { status: "updated", contactId: adopted.contact_id };
  }

  const created = await client.createContact(contactPayload(customer, { includeOpeningBalance: true }));
  await upsertMapping({
    tenantId: conn.tenantId,
    customerId: customer.id,
    zohoContactId: created.contact_id,
    localFingerprint: fingerprint,
    zohoLastModified: created.last_modified_time ?? null,
  });
  return { status: "created", contactId: created.contact_id };
}

/** Email → phone → exact contact name, in that order of confidence. */
async function findExistingContact(
  client: ZohoBooksClient,
  customer: Customer,
): Promise<ZohoContact | null> {
  const email = emailKey(customer.email);
  if (email) {
    const hits = await client.searchContacts({ email });
    const match = hits.find((c) => emailKey(c.email) === email) ?? hits[0];
    if (match) return match;
  }
  const phone = clean(customer.phone);
  if (phone) {
    const hits = await client.searchContacts({ phone });
    const target = phoneKey(phone);
    const match = hits.find((c) => phoneKey(c.phone) === target || phoneKey(c.mobile) === target);
    if (match) return match;
  }
  const name = clean(customer.name);
  if (name) {
    const hits = await client.searchContacts({ contactName: name });
    const match = hits.find((c) => clean(c.contact_name).toLowerCase() === name.toLowerCase());
    if (match) return match;
  }
  return null;
}

/**
 * Fire-and-forget push used by the customers API after a create/edit. Never
 * throws and never blocks the POS response — failures land in the sync log.
 */
export function queueCustomerPush(tenantId: number, customerId: number): void {
  void (async () => {
    try {
      const conn = await getConnection(tenantId);
      if (!conn || !conn.isActive || !conn.syncCustomers || !conn.autoSync) return;
      if (!conn.organizationId) return;
      if (conn.syncDirection === "zoho_to_nexus") return; // pull-only: nothing to push

      const [customer] = await db
        .select()
        .from(customersTable)
        .where(and(eq(customersTable.id, customerId), eq(customersTable.tenantId, tenantId)))
        .limit(1);
      if (!customer) return;

      const [mapping] = await db
        .select()
        .from(zohoCustomerMappingsTable)
        .where(
          and(
            eq(zohoCustomerMappingsTable.tenantId, tenantId),
            eq(zohoCustomerMappingsTable.customerId, customerId),
          ),
        )
        .limit(1);

      const client = await getBooksClient(conn);
      const result = await pushCustomer(conn, client, customer, mapping ?? null);
      if (result.status !== "skipped") {
        await db.insert(zohoSyncLogsTable).values({
          tenantId,
          syncType: "customer",
          direction: "nexus_to_zoho",
          status: "success",
          itemsProcessed: 1,
          itemsCreated: result.status === "created" ? 1 : 0,
          itemsUpdated: result.status === "updated" ? 1 : 0,
          message: `${customer.name} ${result.status === "created" ? "added to" : "updated in"} Zoho Books`,
          completedAt: new Date(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await markMappingError(tenantId, customerId, message).catch(() => undefined);
      await db
        .insert(zohoSyncLogsTable)
        .values({
          tenantId,
          syncType: "customer",
          direction: "nexus_to_zoho",
          status: "error",
          itemsProcessed: 1,
          itemsFailed: 1,
          message: message.slice(0, 500),
          completedAt: new Date(),
        })
        .catch(() => undefined);
    }
  })();
}

/* ─────────────────────────── full sync run ─────────────────────────── */

export type SyncSummary = {
  status: "success" | "partial" | "error";
  processed: number;
  created: number;
  updated: number;
  failed: number;
  pulledCreated: number;
  pulledUpdated: number;
  pushedCreated: number;
  pushedUpdated: number;
  conflicts: number;
  remaining: number;
  message: string;
};

// One full sync per tenant at a time — two concurrent runs would duplicate
// contacts (both would miss the other's not-yet-written mapping rows).
const running = new Set<number>();

export function isSyncRunning(tenantId: number): boolean {
  return running.has(tenantId);
}

export async function runFullCustomerSync(conn: ZohoConnection): Promise<SyncSummary> {
  const tenantId = conn.tenantId;
  if (running.has(tenantId)) {
    throw new ZohoApiError("A Zoho sync is already running for this business.", 409);
  }
  running.add(tenantId);
  const startedAt = new Date();

  const summary: SyncSummary = {
    status: "success",
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    pulledCreated: 0,
    pulledUpdated: 0,
    pushedCreated: 0,
    pushedUpdated: 0,
    conflicts: 0,
    remaining: 0,
    message: "",
  };
  const errors: string[] = [];
  let writes = 0;
  const budgetLeft = () => writes < MAX_WRITES_PER_RUN;

  try {
    if (!conn.organizationId) {
      throw new ZohoApiError("Choose a Zoho Books organisation before syncing.", 400);
    }
    const direction = conn.syncDirection;
    const doPull = direction === "zoho_to_nexus" || direction === "two_way";
    const doPush = direction === "nexus_to_zoho" || direction === "two_way";

    const client = await getBooksClient(conn);

    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.tenantId, tenantId));

    const mappings = await db
      .select()
      .from(zohoCustomerMappingsTable)
      .where(eq(zohoCustomerMappingsTable.tenantId, tenantId));

    const customerById = new Map<number, Customer>(customers.map((c) => [c.id, c]));
    const mappingByCustomerId = new Map<number, Mapping>(mappings.map((m) => [m.customerId, m]));
    const mappingByContactId = new Map<string, Mapping>(mappings.map((m) => [m.zohoContactId, m]));

    // Local match indexes (first writer wins so duplicates don't ping-pong).
    const byEmail = new Map<string, Customer>();
    const byPhone = new Map<string, Customer>();
    const byName = new Map<string, Customer>();
    for (const c of customers) {
      const e = emailKey(c.email);
      if (e && !byEmail.has(e)) byEmail.set(e, c);
      for (const p of [phoneKey(c.phone), phoneKey(c.phone2)]) {
        if (p.length >= 7 && !byPhone.has(p)) byPhone.set(p, c);
      }
      const n = clean(c.name).toLowerCase();
      if (n && !byName.has(n)) byName.set(n, c);
    }

    const handledCustomerIds = new Set<number>();

    /* ── Pass 1: Zoho → NEXXUS (also reconciles already-mapped pairs) ── */
    if (doPull) {
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 50) {
        const { contacts, hasMore: more } = await client.listContacts(page);
        hasMore = more;
        page += 1;

        for (const contact of contacts) {
          summary.processed += 1;
          try {
            const mapping = mappingByContactId.get(contact.contact_id);
            let local = mapping ? customerById.get(mapping.customerId) : undefined;

            // Unmapped contact: try to match an existing POS customer.
            if (!local) {
              const email = emailKey(contact.email) || emailKey(primaryPerson(contact)?.email);
              const phone = phoneKey(contact.phone) || phoneKey(contact.mobile);
              const name = clean(contact.contact_name).toLowerCase();
              const candidate =
                (email ? byEmail.get(email) : undefined) ??
                (phone.length >= 7 ? byPhone.get(phone) : undefined) ??
                (name ? byName.get(name) : undefined);
              if (candidate && !mappingByCustomerId.has(candidate.id)) {
                local = candidate;
              }
            }

            if (!local) {
              // Brand new customer coming from Zoho.
              if (!budgetLeft()) {
                summary.remaining += 1;
                continue;
              }
              const fields = customerFieldsFromContact(contact);
              const cardNumber = await generateCardNumber(tenantId);
              const [inserted] = await db
                .insert(customersTable)
                .values({
                  tenantId,
                  name: fields.name,
                  company: fields.company ?? null,
                  email: fields.email ?? null,
                  phone: fields.phone ?? null,
                  phone2: fields.phone2 ?? null,
                  address: fields.address ?? null,
                  city: fields.city ?? null,
                  state: fields.state ?? null,
                  postalCode: fields.postalCode ?? null,
                  notes: fields.notes ?? null,
                  cardNumber,
                })
                .returning();
              if (!inserted) continue;
              writes += 1;
              customerById.set(inserted.id, inserted);
              await upsertMapping({
                tenantId,
                customerId: inserted.id,
                zohoContactId: contact.contact_id,
                localFingerprint: fingerprintCustomer(inserted),
                zohoLastModified: contact.last_modified_time ?? null,
              });
              summary.created += 1;
              summary.pulledCreated += 1;
              handledCustomerIds.add(inserted.id);
              continue;
            }

            handledCustomerIds.add(local.id);
            const existingMapping = mappingByCustomerId.get(local.id) ?? mapping ?? null;
            const localFingerprint = fingerprintCustomer(local);
            const localChanged =
              !existingMapping || existingMapping.localFingerprint !== localFingerprint;
            const zohoChanged =
              !existingMapping ||
              (existingMapping.zohoLastModified ?? null) !== (contact.last_modified_time ?? null);

            // Both sides moved: NEXXUS is the winner, and we say so in the log.
            if (localChanged && zohoChanged && doPush) {
              summary.conflicts += 1;
            }

            if (localChanged && doPush) {
              if (!budgetLeft()) {
                summary.remaining += 1;
                continue;
              }
              const updated = await client.updateContact(
                contact.contact_id,
                contactPayload(local, {
                  primaryContactPersonId: primaryPerson(contact)?.contact_person_id ?? null,
                }),
              );
              writes += 1;
              await sleep(WRITE_DELAY_MS);
              await upsertMapping({
                tenantId,
                customerId: local.id,
                zohoContactId: contact.contact_id,
                localFingerprint,
                zohoLastModified: updated.last_modified_time ?? null,
              });
              summary.updated += 1;
              summary.pushedUpdated += 1;
              continue;
            }

            if (zohoChanged) {
              const changes = diffFromContact(local, contact);
              if (Object.keys(changes).length > 0) {
                const [updatedLocal] = await db
                  .update(customersTable)
                  .set(changes)
                  .where(and(eq(customersTable.id, local.id), eq(customersTable.tenantId, tenantId)))
                  .returning();
                if (updatedLocal) {
                  customerById.set(updatedLocal.id, updatedLocal);
                  summary.updated += 1;
                  summary.pulledUpdated += 1;
                  await upsertMapping({
                    tenantId,
                    customerId: updatedLocal.id,
                    zohoContactId: contact.contact_id,
                    localFingerprint: fingerprintCustomer(updatedLocal),
                    zohoLastModified: contact.last_modified_time ?? null,
                  });
                  continue;
                }
              }
            }

            // Nothing to move, but keep the mapping/fingerprint current.
            await upsertMapping({
              tenantId,
              customerId: local.id,
              zohoContactId: contact.contact_id,
              localFingerprint,
              zohoLastModified: contact.last_modified_time ?? null,
            });
          } catch (err) {
            summary.failed += 1;
            const message = err instanceof Error ? err.message : "Unknown error";
            errors.push(`${contact.contact_name ?? contact.contact_id}: ${message}`);
            if (err instanceof ZohoApiError && err.status === 429) throw err;
          }
        }
      }
    }

    /* ── Pass 2: NEXXUS → Zoho for anything pass 1 didn't cover ── */
    if (doPush) {
      for (const customer of customers) {
        if (handledCustomerIds.has(customer.id)) continue;
        const mapping = mappingByCustomerId.get(customer.id) ?? null;
        if (mapping && mapping.localFingerprint === fingerprintCustomer(customer) && mapping.syncStatus === "synced" && doPull) {
          // Already reconciled by a previous run and Zoho didn't list it.
          continue;
        }
        if (!budgetLeft()) {
          summary.remaining += 1;
          continue;
        }
        summary.processed += 1;
        try {
          const result = await pushCustomer(conn, client, customer, mapping);
          writes += 1;
          await sleep(WRITE_DELAY_MS);
          if (result.status === "created") {
            summary.created += 1;
            summary.pushedCreated += 1;
          } else if (result.status === "updated") {
            summary.updated += 1;
            summary.pushedUpdated += 1;
          }
        } catch (err) {
          summary.failed += 1;
          const message = err instanceof Error ? err.message : "Unknown error";
          errors.push(`${customer.name}: ${message}`);
          await markMappingError(tenantId, customer.id, message).catch(() => undefined);
          if (err instanceof ZohoApiError && err.status === 429) throw err;
        }
      }
    }

    summary.status = summary.failed > 0 || summary.remaining > 0 ? "partial" : "success";
    const bits = [
      `${summary.created} added`,
      `${summary.updated} updated`,
      summary.failed ? `${summary.failed} failed` : "",
      summary.conflicts ? `${summary.conflicts} kept the NEXXUS version` : "",
      summary.remaining ? `${summary.remaining} left for the next run` : "",
    ].filter(Boolean);
    summary.message = bits.join(", ");
  } catch (err) {
    summary.status = "error";
    summary.message = err instanceof Error ? err.message : "Zoho sync failed.";
    errors.push(summary.message);
  } finally {
    running.delete(tenantId);
  }

  const completedAt = new Date();
  await db
    .insert(zohoSyncLogsTable)
    .values({
      tenantId,
      syncType: "customers",
      direction: conn.syncDirection,
      status: summary.status,
      itemsProcessed: summary.processed,
      itemsCreated: summary.created,
      itemsUpdated: summary.updated,
      itemsFailed: summary.failed,
      message: summary.message.slice(0, 500),
      details: {
        pulledCreated: summary.pulledCreated,
        pulledUpdated: summary.pulledUpdated,
        pushedCreated: summary.pushedCreated,
        pushedUpdated: summary.pushedUpdated,
        conflicts: summary.conflicts,
        remaining: summary.remaining,
        errors: errors.slice(0, 25),
      },
      startedAt,
      completedAt,
    })
    .catch(() => undefined);

  await db
    .update(zohoConnectionsTable)
    .set({
      lastSyncAt: completedAt,
      lastSyncStatus: summary.status,
      lastSyncMessage: summary.message.slice(0, 500),
      updatedAt: completedAt,
    })
    .where(eq(zohoConnectionsTable.id, conn.id))
    .catch(() => undefined);

  return summary;
}

/** Drop mapping rows for customers that no longer exist locally. */
export async function pruneMappings(tenantId: number, customerIds: number[]): Promise<void> {
  if (customerIds.length === 0) return;
  await db
    .delete(zohoCustomerMappingsTable)
    .where(
      and(
        eq(zohoCustomerMappingsTable.tenantId, tenantId),
        inArray(zohoCustomerMappingsTable.customerId, customerIds),
      ),
    );
}
