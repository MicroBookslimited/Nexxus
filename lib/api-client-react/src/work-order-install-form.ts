/**
 * NEXXUS Universal Technology Installation Work Order — shared form definition.
 *
 * One master template, conditionally rendered: the dispatcher/technician picks
 * the applicable SERVICE AREAS and only those sections appear. Within a
 * section, fields can further reveal via `showIf` (progressive disclosure).
 *
 * Answers are stored on the work order as `installDetails`:
 *   { [sectionId]: { [fieldId]: value } }
 * Table fields store an array of row objects keyed by column id.
 * Checklist fields store an array of the checked item ids.
 *
 * Both the web POS and the FSM technician app render this same definition,
 * so adding a field here updates every surface at once.
 */

export const SERVICE_AREAS = [
  { id: "pos",            label: "POS Installation" },
  { id: "networking",     label: "Networking" },
  { id: "pc_it",          label: "PC & IT" },
  { id: "access_control", label: "Access Control" },
  { id: "cctv",           label: "CCTV / Security" },
  { id: "other",          label: "Other / Custom" },
] as const;

export type ServiceAreaId = (typeof SERVICE_AREAS)[number]["id"];

export type InstallFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"    // dropdown
  | "radio"     // radio group (few options)
  | "yesno"     // yes / no radio
  | "checklist" // multiple independent checkboxes → string[] of checked ids
  | "table";    // repeatable rows

export interface InstallShowIf {
  field: string;               // field id within the same section
  equals: string | boolean;    // value that reveals this field
}

export interface InstallTableColumn {
  id: string;
  label: string;
  type?: "text" | "number" | "yesno" | "select";
  options?: string[];          // for select columns
  width?: "narrow" | "normal" | "wide";
}

export interface InstallField {
  id: string;
  label: string;
  type: InstallFieldType;
  options?: string[];              // select / radio
  items?: { id: string; label: string }[]; // checklist
  columns?: InstallTableColumn[];  // table
  rowLabel?: string;               // table: "Station", "Camera", …
  placeholder?: string;
  help?: string;
  showIf?: InstallShowIf;
}

export interface InstallSection {
  id: string;
  title: string;
  /** undefined = always shown; otherwise only when one of these areas is selected */
  areas?: ServiceAreaId[];
  description?: string;
  fields: InstallField[];
}

const YESNO_COL = (id: string, label: string): InstallTableColumn => ({ id, label, type: "yesno", width: "narrow" });

export const INSTALL_SECTIONS: InstallSection[] = [
  // ── 1. Pre-Installation Site Assessment (always) ──────────────────────────
  {
    id: "site_assessment",
    title: "Pre-Installation Site Assessment",
    description: "Complete before work starts.",
    fields: [
      {
        id: "readiness", label: "Site readiness", type: "checklist",
        items: [
          { id: "power_available",     label: "Power available" },
          { id: "adequate_outlets",    label: "Adequate electrical outlets" },
          { id: "ups_surge",           label: "UPS / surge protection" },
          { id: "internet_active",     label: "Internet active" },
          { id: "router_accessible",   label: "Router accessible" },
          { id: "cabinet_accessible",  label: "Network cabinet accessible" },
          { id: "passwords_available", label: "Required passwords available" },
          { id: "equipment_delivered", label: "Equipment delivered" },
          { id: "areas_accessible",    label: "Installation areas accessible" },
          { id: "customer_present",    label: "Customer representative present" },
          { id: "surfaces_suitable",   label: "Installation surfaces suitable" },
        ],
      },
      { id: "internetProvider", label: "Internet provider", type: "text" },
      { id: "downloadSpeed",    label: "Download speed",    type: "text", placeholder: "e.g. 100 Mbps" },
      { id: "uploadSpeed",      label: "Upload speed",      type: "text", placeholder: "e.g. 20 Mbps" },
      { id: "publicStaticIp",   label: "Public / static IP", type: "text" },
      { id: "routerMakeModel",  label: "Router make / model", type: "text" },
      { id: "existingNetwork",  label: "Existing network",  type: "yesno" },
      { id: "existingRack",     label: "Existing rack",     type: "yesno" },
      { id: "existingCabling",  label: "Existing cabling",  type: "yesno" },
      { id: "electricalIssues", label: "Electrical issues", type: "textarea" },
      { id: "siteIssues",       label: "Site issues identified", type: "textarea" },
    ],
  },

  // ── 2. Equipment Issued / Installed (always) ──────────────────────────────
  {
    id: "equipment",
    title: "Equipment Issued / Installed",
    fields: [
      {
        id: "items", label: "Equipment", type: "table", rowLabel: "Item",
        columns: [
          { id: "qty",      label: "Qty", type: "number", width: "narrow" },
          { id: "equipment", label: "Equipment", width: "wide" },
          { id: "brand",    label: "Brand" },
          { id: "model",    label: "Model" },
          { id: "serial",   label: "Serial #" },
          { id: "mac",      label: "MAC address" },
          { id: "assetTag", label: "Asset tag" },
          { id: "location", label: "Location installed" },
          { id: "source",   label: "Source", type: "select",
            options: ["New", "Existing", "Customer Supplied", "MicroBooks Supplied", "Replacement", "Loaner"] },
        ],
      },
    ],
  },

  // ── 3. Networking Installation ─────────────────────────────────────────────
  {
    id: "networking",
    title: "Networking Installation",
    areas: ["networking"],
    fields: [
      { id: "isp",            label: "ISP",                 type: "text" },
      { id: "modemOnt",       label: "Modem / ONT",         type: "text" },
      { id: "routerFirewall", label: "Router / firewall",   type: "text" },
      { id: "wanIp",          label: "WAN IP",              type: "text" },
      { id: "lanGateway",     label: "LAN gateway",         type: "text" },
      { id: "subnet",         label: "Subnet",              type: "text" },
      { id: "dns",            label: "DNS configuration",   type: "text" },
      { id: "dhcpRange",      label: "DHCP range",          type: "text" },
      {
        id: "switches", label: "Switches", type: "table", rowLabel: "Switch",
        columns: [
          { id: "device", label: "Device" },
          { id: "model",  label: "Model" },
          { id: "mgmtIp", label: "Management IP" },
          { id: "ports",  label: "Ports", type: "number", width: "narrow" },
          YESNO_COL("poe", "PoE"),
          { id: "location", label: "Location" },
        ],
      },
      { id: "ssid",       label: "SSID",             type: "text" },
      { id: "apName",     label: "Access point name / location", type: "text" },
      { id: "apMgmtIp",   label: "AP management IP", type: "text" },
      { id: "band",       label: "Frequency / band", type: "select", options: ["2.4 GHz", "5 GHz", "6 GHz", "Mixed"] },
      { id: "guestNetwork", label: "Guest network configured", type: "yesno" },
      { id: "guestSsid",  label: "Guest SSID", type: "text", showIf: { field: "guestNetwork", equals: true } },
      { id: "signalTest", label: "Signal test / coverage results", type: "textarea",
        help: "Never record Wi-Fi passwords or admin credentials here — they appear on customer copies." },
      {
        id: "cabling", label: "Cable runs", type: "table", rowLabel: "Cable",
        columns: [
          { id: "label", label: "Cable #", placeholder: "NET-001" } as InstallTableColumn,
          { id: "from",  label: "From" },
          { id: "to",    label: "To" },
          { id: "type",  label: "Type", type: "select", options: ["CAT5e", "CAT6", "CAT6A", "Fibre", "Other"] },
          { id: "length", label: "Length" },
          { id: "port",  label: "Port" },
          YESNO_COL("tested", "Tested"),
        ],
      },
      {
        id: "testing", label: "Network testing — confirmed", type: "checklist",
        items: [
          { id: "internet",       label: "Internet connectivity" },
          { id: "gateway",        label: "Gateway access" },
          { id: "dns",            label: "DNS resolution" },
          { id: "dhcp",           label: "DHCP assignment" },
          { id: "static_devices", label: "Static IP devices" },
          { id: "switches",       label: "Switch connectivity" },
          { id: "wifi_coverage",  label: "Wi-Fi coverage" },
          { id: "printer_comm",   label: "Printer communication" },
          { id: "pos_comm",       label: "POS communication" },
          { id: "cable_continuity", label: "Cable continuity" },
        ],
      },
      { id: "pingTest",   label: "Ping test result",   type: "text" },
      { id: "speedTest",  label: "Speed test result",  type: "text" },
      { id: "cableTester", label: "Cable tester result", type: "text" },
    ],
  },

  // ── 4. POS Installation ────────────────────────────────────────────────────
  {
    id: "pos",
    title: "POS Installation",
    areas: ["pos"],
    fields: [
      {
        id: "stations", label: "POS stations", type: "table", rowLabel: "Station",
        columns: [
          { id: "station",  label: "Station", placeholder: "POS 1" } as InstallTableColumn,
          { id: "terminal", label: "Terminal" },
          { id: "ip",       label: "IP address" },
          { id: "printer",  label: "Printer" },
          YESNO_COL("drawer",  "Drawer"),
          YESNO_COL("scanner", "Scanner"),
          YESNO_COL("display", "Cust. display"),
          YESNO_COL("tested",  "Tested"),
        ],
      },
      {
        id: "hardware", label: "POS hardware checklist", type: "checklist",
        items: [
          { id: "terminal_mounted",  label: "Terminal mounted securely" },
          { id: "touchscreen",       label: "Touchscreen tested" },
          { id: "printer_connected", label: "Printer connected" },
          { id: "paper_installed",   label: "Paper installed" },
          { id: "drawer_connected",  label: "Cash drawer connected" },
          { id: "scanner_configured", label: "Barcode scanner configured" },
          { id: "display_tested",    label: "Customer display tested" },
          { id: "scale_configured",  label: "Scale configured (where applicable)" },
          { id: "payment_terminal",  label: "Payment terminal connected" },
          { id: "cable_management",  label: "Cable management completed" },
        ],
      },
      { id: "nexxusMode", label: "NEXXUS mode", type: "select",
        options: ["Retail", "Restaurant", "Hardware", "Supermarket", "Courier", "Other"] },
      { id: "usersCreated",       label: "Users created",        type: "number" },
      { id: "registersConfigured", label: "Registers configured", type: "number" },
      {
        id: "softwareConfig", label: "NEXXUS configuration — confirmed", type: "checklist",
        items: [
          { id: "business_settings", label: "Business settings" },
          { id: "taxes",             label: "Taxes / GCT" },
          { id: "payment_methods",   label: "Payment methods" },
          { id: "receipt_template",  label: "Receipt template" },
          { id: "categories",        label: "Categories" },
          { id: "products",          label: "Products" },
          { id: "inventory",         label: "Inventory" },
          { id: "units",             label: "Units of measure" },
          { id: "volume_pricing",    label: "Volume pricing" },
          { id: "sell_by_weight",    label: "Sell-by-weight" },
          { id: "permissions",       label: "Employee permissions" },
          { id: "manager_pins",      label: "Manager PIN controls" },
        ],
      },
      {
        id: "posTesting", label: "POS test transaction — covered", type: "checklist",
        items: [
          { id: "product_search", label: "Product search" },
          { id: "barcode_scan",   label: "Barcode scan" },
          { id: "qty_change",     label: "Quantity change" },
          { id: "discount",       label: "Discount (if applicable)" },
          { id: "payment",        label: "Payment" },
          { id: "receipt_print",  label: "Receipt printing" },
          { id: "drawer_open",    label: "Cash drawer opening" },
          { id: "cust_display",   label: "Customer display" },
          { id: "reporting",      label: "Transaction reporting" },
        ],
      },
      { id: "testSaleNumber", label: "Test sale #", type: "text" },
      { id: "testVoided",     label: "Test transaction voided / flagged as test", type: "yesno" },
    ],
  },

  // ── 5. PC / Workstation Installation ───────────────────────────────────────
  {
    id: "pc",
    title: "PC / Workstation Installation",
    areas: ["pc_it"],
    fields: [
      {
        id: "pcs", label: "Computers", type: "table", rowLabel: "PC",
        columns: [
          { id: "pcNo",          label: "PC #", width: "narrow" },
          { id: "brandModel",    label: "Brand / model", width: "wide" },
          { id: "serial",        label: "Serial #" },
          { id: "windows",       label: "Windows version" },
          { id: "computerName",  label: "Computer name" },
          { id: "user",          label: "User" },
          { id: "ip",            label: "IP" },
        ],
      },
      {
        id: "setup", label: "Setup — confirmed", type: "checklist",
        items: [
          { id: "os_activated",   label: "OS activated" },
          { id: "updates",        label: "Windows updates" },
          { id: "drivers",        label: "Drivers" },
          { id: "antivirus",      label: "Antivirus / security" },
          { id: "browsers",       label: "Browsers" },
          { id: "printer",        label: "Printer" },
          { id: "network",        label: "Network connection" },
          { id: "user_account",   label: "User account" },
          { id: "datetime",       label: "Date / time" },
          { id: "power_settings", label: "Power settings" },
          { id: "office",         label: "Office / productivity software" },
          { id: "customer_apps",  label: "Customer applications" },
          { id: "remote_agent",   label: "Remote-support agent (where authorized)" },
          { id: "backup",         label: "Backup configuration" },
        ],
      },
      { id: "dataMigration", label: "Data migration performed", type: "yesno" },
      { id: "oldPc",         label: "Old PC",  type: "text",     showIf: { field: "dataMigration", equals: true } },
      { id: "newPc",         label: "New PC",  type: "text",     showIf: { field: "dataMigration", equals: true } },
      { id: "dataMigrated",  label: "Data migrated", type: "textarea", showIf: { field: "dataMigration", equals: true } },
      { id: "emailMigrated", label: "Email migrated",   type: "yesno", showIf: { field: "dataMigration", equals: true } },
      { id: "browserData",   label: "Browser data",     type: "yesno", showIf: { field: "dataMigration", equals: true } },
      { id: "appData",       label: "Application data", type: "yesno", showIf: { field: "dataMigration", equals: true } },
      { id: "backupBefore",  label: "Backup completed before migration", type: "yesno", showIf: { field: "dataMigration", equals: true } },
      { id: "formatConfirmed", label: "Customer confirmed before old equipment formatted / retired", type: "yesno",
        showIf: { field: "dataMigration", equals: true } },
    ],
  },

  // ── 6. Access Control Installation ─────────────────────────────────────────
  {
    id: "access_control",
    title: "Access Control Installation",
    areas: ["access_control"],
    fields: [
      {
        id: "doors", label: "Doors", type: "table", rowLabel: "Door",
        columns: [
          { id: "door",       label: "Door", width: "narrow" },
          { id: "location",   label: "Location" },
          { id: "reader",     label: "Reader" },
          { id: "lock",       label: "Lock" },
          { id: "exitDevice", label: "Exit device" },
          { id: "doorContact", label: "Door contact" },
          { id: "controller", label: "Controller" },
        ],
      },
      { id: "mgmtIp",       label: "Management IP", type: "text" },
      { id: "controllerId", label: "Controller ID", type: "text" },
      { id: "schedules",    label: "Access schedules", type: "textarea" },
      { id: "adminsCreated", label: "Administrators created", type: "number",
        help: "Admin credentials are stored securely in NEXXUS — never write them here." },
      { id: "usersEnrolled",    label: "Users enrolled",        type: "number" },
      { id: "cardsEnrolled",    label: "Cards enrolled",        type: "number" },
      { id: "fingerprints",     label: "Fingerprints enrolled", type: "number" },
      { id: "facialProfiles",   label: "Facial profiles enrolled", type: "number" },
      {
        id: "testing", label: "Access control testing — verified", type: "checklist",
        items: [
          { id: "entry_auth",       label: "Entry authentication" },
          { id: "lock_release",     label: "Lock release" },
          { id: "exit_button",      label: "Exit button" },
          { id: "emergency_release", label: "Emergency release" },
          { id: "door_contact",     label: "Door contact" },
          { id: "denied_access",    label: "Denied-access behaviour" },
          { id: "schedules",        label: "Schedules" },
          { id: "power_failure",    label: "Power failure response" },
          { id: "backup_battery",   label: "Backup battery" },
          { id: "software_mobile",  label: "Software / mobile access" },
        ],
      },
    ],
  },

  // ── 7. CCTV / Security ──────────────────────────────────────────────────────
  {
    id: "cctv",
    title: "CCTV / Security",
    areas: ["cctv"],
    fields: [
      { id: "nvrModel",      label: "NVR / DVR model",  type: "text" },
      { id: "nvrSerial",     label: "NVR / DVR serial", type: "text" },
      { id: "nvrIp",         label: "NVR / DVR IP",     type: "text" },
      { id: "hardDrives",    label: "Hard drives",      type: "text", placeholder: "e.g. 2 × 4TB" },
      { id: "recordingDays", label: "Expected recording duration (days)", type: "number" },
      { id: "remoteViewing", label: "Remote viewing configured", type: "yesno" },
      {
        id: "cameras", label: "Cameras", type: "table", rowLabel: "Camera",
        columns: [
          { id: "camNo",   label: "Camera #", width: "narrow" },
          { id: "location", label: "Location", width: "wide" },
          { id: "type",    label: "Type", type: "select", options: ["IP", "Analog"] },
          { id: "model",   label: "Model" },
          { id: "ip",      label: "IP" },
          { id: "channel", label: "NVR channel", width: "narrow" },
          YESNO_COL("tested", "Tested"),
        ],
      },
      {
        id: "verify", label: "Verified", type: "checklist",
        items: [
          { id: "day_image",   label: "Daytime image" },
          { id: "night_vision", label: "Night vision" },
          { id: "recording",   label: "Recording" },
          { id: "playback",    label: "Playback" },
          { id: "motion",      label: "Motion events" },
          { id: "network",     label: "Network connectivity" },
          { id: "remote_view", label: "Remote viewing" },
        ],
      },
    ],
  },

  // ── 8. Issues / Exceptions (always) ────────────────────────────────────────
  {
    id: "issues",
    title: "Issues / Exceptions",
    description: "Record anything preventing completion.",
    fields: [
      {
        id: "list", label: "Issues", type: "table", rowLabel: "Issue",
        columns: [
          { id: "type", label: "Issue type", type: "select", width: "wide",
            options: [
              "Customer Not Ready", "Internet Unavailable", "Power Issue", "Construction Required",
              "Additional Cabling Required", "Equipment Missing", "Equipment Defective",
              "Customer Change Request", "Third-Party Dependency", "Additional Parts Required",
              "Return Visit Required",
            ] },
          { id: "description",  label: "Description", width: "wide" },
          { id: "action",       label: "Recommended action", width: "wide" },
          { id: "responsible",  label: "Responsible party", type: "select",
            options: ["Customer", "MicroBooks", "ISP", "Contractor", "Other"] },
          { id: "followUpDate", label: "Follow-up date" },
        ],
      },
    ],
  },

  // ── 9. Change Requests / Additional Work (always) ──────────────────────────
  {
    id: "change_requests",
    title: "Change Requests / Additional Work",
    description: "No chargeable work outside the approved scope without authorization.",
    fields: [
      {
        id: "list", label: "Change requests", type: "table", rowLabel: "Request",
        columns: [
          { id: "work",       label: "Additional work requested", width: "wide" },
          { id: "requestedBy", label: "Requested by" },
          { id: "estCost",    label: "Estimated additional cost" },
          YESNO_COL("approved", "Customer approved"),
        ],
      },
    ],
  },

  // ── 10. Customer Training (always) ─────────────────────────────────────────
  {
    id: "training",
    title: "Customer Training",
    fields: [
      {
        id: "topics", label: "Demonstrated", type: "checklist",
        items: [
          { id: "pos_login",       label: "POS login / logout" },
          { id: "sales",           label: "Sales" },
          { id: "returns_voids",   label: "Returns / voids" },
          { id: "product_search",  label: "Product search" },
          { id: "barcode",         label: "Barcode scanning" },
          { id: "cash_drawer",     label: "Cash drawer" },
          { id: "reports",         label: "Reports" },
          { id: "inventory",       label: "Inventory" },
          { id: "customers",       label: "Customer management" },
          { id: "manager",         label: "Manager functions" },
          { id: "pc_operation",    label: "PC operation" },
          { id: "network_basics",  label: "Network basics" },
          { id: "cctv_viewing",    label: "CCTV viewing" },
          { id: "access_enrollment", label: "Access control user enrollment" },
          { id: "troubleshooting", label: "Troubleshooting" },
          { id: "support",         label: "Support procedure" },
        ],
      },
      { id: "personsTrained",   label: "Persons trained",   type: "text" },
      { id: "trainingDuration", label: "Training duration", type: "text", placeholder: "e.g. 1.5 hours" },
      { id: "completed",        label: "Training completed", type: "yesno" },
      { id: "additionalNeeded", label: "Additional training required", type: "yesno" },
    ],
  },

  // ── 11. Customer Handover (always) ─────────────────────────────────────────
  {
    id: "handover",
    title: "Customer Handover",
    fields: [
      {
        id: "checklist", label: "Handover", type: "checklist",
        items: [
          { id: "equipment",   label: "Equipment handed over" },
          { id: "keys",        label: "Keys handed over" },
          { id: "cards",       label: "Access cards handed over" },
          { id: "docs",        label: "Documentation provided" },
          { id: "credentials", label: "Passwords / credentials securely transferred" },
          { id: "warranty",    label: "Warranty information provided" },
          { id: "support",     label: "Customer informed of support procedures" },
          { id: "outstanding", label: "Customer advised of outstanding work" },
        ],
      },
    ],
  },

  // ── 12. Completion Status (always) ─────────────────────────────────────────
  {
    id: "completion",
    title: "Completion Status",
    fields: [
      { id: "status", label: "Completion status", type: "select",
        options: [
          "Completed Successfully", "Completed With Outstanding Items", "Partially Completed",
          "Awaiting Parts", "Awaiting Customer", "Return Visit Required", "Unable to Complete",
        ] },
      { id: "notes",       label: "Technician completion notes", type: "textarea" },
      { id: "outstanding", label: "Outstanding items",           type: "textarea",
        showIf: { field: "status", equals: "Completed With Outstanding Items" } },
      { id: "followUp",     label: "Recommended follow-up", type: "textarea" },
      { id: "followUpDate", label: "Follow-up date",        type: "text", placeholder: "YYYY-MM-DD" },
    ],
  },
];

export type InstallDetails = Record<string, Record<string, unknown>>;

/** Sections visible for a given set of selected service areas. */
export function visibleInstallSections(serviceAreas: string[]): InstallSection[] {
  return INSTALL_SECTIONS.filter(
    (s) => !s.areas || s.areas.some((a) => serviceAreas.includes(a)),
  );
}

/** Whether a field should currently be shown given the section's answers. */
export function installFieldVisible(field: InstallField, sectionData: Record<string, unknown> | undefined): boolean {
  if (!field.showIf) return true;
  return (sectionData?.[field.showIf.field] ?? null) === field.showIf.equals;
}

/** Count of answered fields in a section (for progress chips). */
export function installSectionProgress(section: InstallSection, data: Record<string, unknown> | undefined): { done: number; total: number } {
  let done = 0, total = 0;
  for (const f of section.fields) {
    if (!installFieldVisible(f, data)) continue;
    total++;
    const v = data?.[f.id];
    if (v == null) continue;
    if (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "") done++;
  }
  return { done, total };
}
