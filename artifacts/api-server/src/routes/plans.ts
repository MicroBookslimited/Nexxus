import { Router, type IRouter } from "express";
import { db, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const ALL_MODULES = ["pos", "reports", "inventory", "customers", "staff", "cash", "tables", "kitchen", "loyalty"];

const SEED_PLANS = [
  {
    name: "Starter",
    slug: "starter",
    description: "Perfect for small businesses getting started",
    priceMonthly: 29,
    priceAnnual: 290,
    maxStaff: 5,
    maxProducts: 100,
    maxLocations: 1,
    maxInvoices: 500,
    modules: JSON.stringify(["pos", "cash", "inventory", "customers", "staff", "reports"]),
    features: JSON.stringify(["POS Terminal", "Cash Management", "Basic Reports", "Email Receipts", "5 Staff Accounts", "Up to 100 Products"]),
    isActive: true,
  },
  {
    name: "Professional",
    slug: "professional",
    description: "For growing businesses that need more",
    priceMonthly: 79,
    priceAnnual: 790,
    maxStaff: 15,
    maxProducts: 500,
    maxLocations: 3,
    maxInvoices: 5000,
    modules: JSON.stringify(["pos", "cash", "inventory", "customers", "staff", "reports", "tables", "kitchen", "loyalty"]),
    features: JSON.stringify(["Everything in Starter", "Kitchen Display", "Table Management", "Advanced Reports", "Customer Loyalty", "15 Staff Accounts", "Up to 500 Products", "3 Locations"]),
    isActive: true,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "Unlimited scale for large operations",
    priceMonthly: 199,
    priceAnnual: 1990,
    maxStaff: 9999,
    maxProducts: 9999,
    maxLocations: 9999,
    maxInvoices: 9999,
    modules: JSON.stringify(ALL_MODULES),
    features: JSON.stringify(["Everything in Professional", "Unlimited Staff", "Unlimited Products", "Unlimited Locations", "Priority Support", "Custom Integrations", "Dedicated Account Manager"]),
    isActive: true,
  },
];

async function seedPlans() {
  const existing = await db.select().from(subscriptionPlansTable);
  if (existing.length === 0) {
    await db.insert(subscriptionPlansTable).values(SEED_PLANS);
  }
}

seedPlans().catch(console.error);

function parsePlan(p: typeof subscriptionPlansTable.$inferSelect) {
  return {
    ...p,
    features: JSON.parse(p.features) as string[],
    modules: JSON.parse(p.modules) as string[],
  };
}

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.isActive, true));
  res.json(plans.map(parsePlan));
});

export default router;
