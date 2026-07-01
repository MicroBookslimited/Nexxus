/**
 * All guided-flow step options and smart-FAQ mappings live here so they can be
 * updated without touching components.
 */
export type Priority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface FlowCategory {
  key: string;
  /** Stored on the ticket as `category`. */
  label: string;
  icon: "monitor" | "package" | "users" | "chart";
  accent: string;
}

export const FLOW_CATEGORIES: FlowCategory[] = [
  { key: "pos", label: "POS & Payments", icon: "monitor", accent: "text-sky-400" },
  { key: "inventory", label: "Inventory & Stock", icon: "package", accent: "text-teal-400" },
  { key: "staff", label: "Staff & Login", icon: "users", accent: "text-indigo-400" },
  { key: "reports", label: "Reports & Billing", icon: "chart", accent: "text-amber-400" },
];

/** Sub-options keyed by category key. Values are stored on the ticket as `subCategory`. */
export const SUBCATEGORIES: Record<string, string[]> = {
  pos: [
    "Screen frozen / not responding",
    "Payment processed but order missing",
    "Receipt not printing",
    "Barcode scanner not working",
    "Wrong price showing",
    "Other POS issue",
  ],
  inventory: [
    "Stock count is wrong",
    "Product not showing at POS",
    "Stock transfer not working",
    "Product showing out of stock incorrectly",
    "Category not showing",
    "Other inventory issue",
  ],
  staff: [
    "Staff forgot PIN",
    "Staff cannot log in",
    "Wrong permissions for staff member",
    "Need to add new staff",
    "Need to remove staff access",
    "Other staff issue",
  ],
  reports: [
    "Report totals incorrect",
    "Cannot export CSV",
    "Subscription / trial question",
    "Incorrect charge",
    "Cannot access reports",
    "Other billing issue",
  ],
};

const GENERIC_TIP =
  "We don't have a quick fix listed for this exact issue. Tap \"Still not working\" to raise a ticket and our team will help you directly.";

/** Most relevant FAQ answer per sub-category, shown in Step 3 (Smart FAQ check). */
export const SMART_FAQ: Record<string, string> = {
  // POS & Payments
  "Screen frozen / not responding":
    "Try refreshing the browser tab first. If that doesn't work, close the browser and reopen it. If the issue persists, check your internet connection — a solid connection is required for NEXXUS POS to function.",
  "Payment processed but order missing":
    "Check the Orders page for the transaction — it may have saved successfully. If you cannot find it, do not re-process the payment. Continue below and our team will investigate.",
  "Receipt not printing":
    "Check that your printer is powered on and connected. For Bluetooth printers, verify the printer is paired in your device's Bluetooth settings. Restart the ESC POS Print Service app and try again.",
  "Barcode scanner not working":
    "Ensure the scanner is connected via USB. Try unplugging and replugging. If it still doesn't scan, check that the cursor is active in the product search field before scanning.",
  "Wrong price showing":
    "Open the product in the Product Catalogue and check its price and any active promotion. If you sell in multiple units, confirm the correct unit is selected at the POS before adding to cart.",
  "Other POS issue": GENERIC_TIP,

  // Inventory & Stock
  "Stock count is wrong":
    "Stock is automatically adjusted with every sale, void, and refund. Check the Order History for any missed voids. If it's still unexplained, continue below with the product name and expected vs actual count.",
  "Product not showing at POS":
    "Check that the product is set to Active in the Product Catalogue, and that it has been assigned to a category. Products marked inactive will not appear at the POS.",
  "Stock transfer not working":
    "Go to Inventory → Stock Transfers → New Transfer. Select the source location, destination, products, and quantities, then confirm the transfer to move stock.",
  "Product showing out of stock incorrectly":
    "Check the stock count for the specific location you're selling from — stock is tracked per location. Adjust it via a stock count if the location figure is off.",
  "Category not showing":
    "Make sure the category exists and has active products assigned to it. Empty or inactive categories are hidden at the POS.",
  "Other inventory issue": GENERIC_TIP,

  // Staff & Login
  "Staff forgot PIN":
    "A Manager or Admin can reset a staff PIN from Settings → Staff Accounts → select the staff member → Reset PIN.",
  "Staff cannot log in":
    "PINs do not auto-lock in NEXXUS POS. Verify the staff member is entering the correct PIN. Reset it via Settings → Staff Accounts if needed.",
  "Wrong permissions for staff member":
    "Permissions come from the staff member's role. Update their role, or the role's permissions, in Settings → Staff Accounts.",
  "Need to add new staff":
    "Go to Settings → Staff Accounts → Add Staff. Enter their name, assign a role, and set a PIN. They can log in immediately.",
  "Need to remove staff access":
    "In Settings → Staff Accounts, open the staff member and deactivate or remove them to revoke their access immediately.",
  "Other staff issue": GENERIC_TIP,

  // Reports & Billing
  "Report totals incorrect":
    "Reports pull live data. Verify the date range is correct and that any voided orders are reflected. If totals still seem wrong, continue below and attach details.",
  "Cannot export CSV":
    "On any Report page, select your date range and click the CSV Export button at the top right. The file downloads to your device.",
  "Subscription / trial question":
    "Contact MicroBooks Limited directly via WhatsApp or email to arrange payment and plan activation. We will extend your trial if payment is in process.",
  "Incorrect charge":
    "Contact support@microbooks.com with your account details and the invoice in question. Our team will review and resolve within 24 hours. You can also continue below to raise a ticket.",
  "Cannot access reports":
    "Access to reports is controlled by permissions. Ask a Manager or Admin to grant your role the Reports permission in Settings → Staff Accounts.",
  "Other billing issue": GENERIC_TIP,
};

export function smartFaqFor(subCategory: string): string {
  return SMART_FAQ[subCategory] ?? GENERIC_TIP;
}

export interface ImpactOption {
  emoji: string;
  label: string;
  priority: Priority;
  /** Tailwind ring/border accent for the selected state. */
  accent: string;
}

export const IMPACT_OPTIONS: ImpactOption[] = [
  { emoji: "🔴", label: "Cannot process any sales — business is stopped", priority: "CRITICAL", accent: "border-red-500 bg-red-500/10" },
  { emoji: "🟠", label: "Sales work but something important isn't functioning", priority: "HIGH", accent: "border-orange-500 bg-orange-500/10" },
  { emoji: "🟡", label: "Minor issue — not blocking sales", priority: "NORMAL", accent: "border-yellow-500 bg-yellow-500/10" },
  { emoji: "🔵", label: "Just a question — no active problem", priority: "LOW", accent: "border-blue-500 bg-blue-500/10" },
];

export const TIMING_OPTIONS: string[] = [
  "Just now (within the last hour)",
  "Today",
  "Yesterday",
  "A few days ago",
  "More than a week ago",
];

export const DEVICE_CHECK_OPTIONS: string[] = [
  "I have restarted the app / browser",
  "I have checked my internet connection",
  "I have restarted the tablet",
  "I have tried on a different device",
  "None of these helped",
];

export interface PriorityMeta {
  label: string;
  color: string;
  response: string;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  CRITICAL: { label: "CRITICAL", color: "#DC2626", response: "Within 2 hours" },
  HIGH: { label: "HIGH", color: "#EA580C", response: "Within 4 hours" },
  NORMAL: { label: "NORMAL", color: "#2563EB", response: "Within 24 hours" },
  LOW: { label: "LOW", color: "#6B7280", response: "Within 48 hours" },
};

export const ADDITIONAL_NOTES_MAX = 280;
