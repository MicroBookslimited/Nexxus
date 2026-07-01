import type { Priority } from "./data/flowData";

export interface TicketDraft {
  categoryKey: string;
  category: string;
  subCategory: string;
  impact: string;
  priority: Priority;
  startedWhen: string;
  stepsTaken: string[];
  additionalNotes: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export type SupportScreen = "home" | "faq" | "flow" | "review" | "success";

export const EMPTY_DRAFT: TicketDraft = {
  categoryKey: "",
  category: "",
  subCategory: "",
  impact: "",
  priority: "NORMAL",
  startedWhen: "",
  stepsTaken: [],
  additionalNotes: "",
  businessName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};
