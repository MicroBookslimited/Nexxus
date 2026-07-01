/**
 * All FAQ content lives here so it can be updated without touching components.
 * `icon` maps to a lucide-react icon in FAQScreen.tsx; `color` is a Tailwind
 * text-color class for that category's icon.
 */
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqCategory {
  key: string;
  title: string;
  icon: "monitor" | "package" | "users" | "chart";
  color: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: "pos",
    title: "POS & Payments",
    icon: "monitor",
    color: "text-sky-400",
    items: [
      {
        q: "The POS screen is frozen or not responding",
        a: "Try refreshing the browser tab first. If that doesn't work, close the browser and reopen it. If the issue persists, check your internet connection. A solid connection is required for NEXXUS POS to function.",
      },
      {
        q: "A payment went through but the order didn't save",
        a: "Check the Orders page for the transaction — it may have saved successfully. If you cannot find it, do not re-process the payment. Submit a support ticket and our team will investigate.",
      },
      {
        q: "The receipt won't print",
        a: "Check that the printer is powered on and connected. For Bluetooth printers, verify the printer is paired in your device's Bluetooth settings. Restart the ESC POS Print Service app on the tablet and try again.",
      },
      {
        q: "The barcode scanner isn't working",
        a: "Ensure the scanner is connected via USB. Try unplugging and replugging. If it still doesn't scan, check that the cursor is active in the product search field before scanning.",
      },
    ],
  },
  {
    key: "inventory",
    title: "Inventory",
    icon: "package",
    color: "text-teal-400",
    items: [
      {
        q: "A product's stock count is wrong",
        a: "Stock is automatically adjusted with every sale, void, and refund. If the count seems incorrect, check the Order History for any missed voids. If unexplained, submit a support ticket with the product name and expected vs actual count.",
      },
      {
        q: "I can't find a product at the POS",
        a: "Check that the product is set to Active in the Product Catalogue. Also verify it has been assigned to a category. Products marked inactive will not appear at the POS.",
      },
      {
        q: "How do I transfer stock between locations?",
        a: "Go to Inventory → Stock Transfers → New Transfer. Select the source location, destination, products, and quantities. Confirm the transfer to move stock.",
      },
    ],
  },
  {
    key: "staff",
    title: "Staff & Login",
    icon: "users",
    color: "text-indigo-400",
    items: [
      {
        q: "A staff member forgot their PIN",
        a: "A Manager or Admin can reset a staff PIN from Settings → Staff Accounts → select the staff member → Reset PIN.",
      },
      {
        q: "A staff member is locked out",
        a: "PINs do not auto-lock in NEXXUS POS. If a staff member cannot log in, verify they are entering the correct PIN. Reset via Settings → Staff Accounts if needed.",
      },
      {
        q: "How do I add a new staff member?",
        a: "Go to Settings → Staff Accounts → Add Staff. Enter their name, assign a role, and set a PIN. They can log in immediately.",
      },
    ],
  },
  {
    key: "reports",
    title: "Reports & Billing",
    icon: "chart",
    color: "text-amber-400",
    items: [
      {
        q: "My report shows incorrect totals",
        a: "Reports pull live data. Verify the date range is correct and that any voided orders are reflected. If totals still seem wrong, export the CSV and submit a ticket with the file attached.",
      },
      {
        q: "How do I export a report?",
        a: "On any Report page, select your date range and click the CSV Export button at the top right. The file will download to your device.",
      },
      {
        q: "My subscription trial is ending — how do I pay?",
        a: "Contact MicroBooks Limited directly via WhatsApp or email to arrange payment and plan activation. We will extend your trial if payment is in process.",
      },
      {
        q: "I was charged incorrectly",
        a: "Contact support@microbooks.com with your account details and the invoice in question. Our team will review and resolve within 24 hours.",
      },
    ],
  },
];
