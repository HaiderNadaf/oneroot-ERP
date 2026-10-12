// Category field templates: extra, category-specific fields on a product (variety, CIB reg. no., NPK grade…)

import type { ProductType } from "./types";

export type FieldType = "text" | "number" | "date" | "select" | "yesno";

export interface FieldDef {
  /** Stable key stored on the product, e.g. "variety" */
  key: string;
  label: string;
  type: FieldType;
  /** Choices for a select */
  options?: string[];
  required?: boolean;
  /** Shown on the POS card / invoice line, e.g. the variety of a seed */
  showOnBill?: boolean;
}

export type Attributes = Record<string, string | number | boolean | null>;

export const FIELD_TYPE_LABEL: Record<FieldType, string> = { text: "Text", number: "Number", date: "Date", select: "Choice", yesno: "Yes / No" };

/** Key from a label: "Germination %" → "germination_pct" */
export const keyFromLabel = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/%/g, " pct")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

/** Starter templates per product type — the manager picks what applies */
export const SUGGESTED_FIELDS: Record<ProductType, FieldDef[]> = {
  SEED: [
    { key: "variety", label: "Variety / hybrid", type: "text", showOnBill: true },
    { key: "crop", label: "Crop", type: "text" },
    { key: "season", label: "Season", type: "select", options: ["Kharif", "Rabi", "Zaid", "All"] },
    { key: "germination_pct", label: "Germination %", type: "number" },
    { key: "lot_no", label: "Lot no.", type: "text" },
    { key: "truthful_label", label: "Truthfully labelled", type: "yesno" },
  ],
  FERTILIZER: [
    { key: "npk_grade", label: "NPK grade", type: "text", showOnBill: true },
    { key: "fco_licence", label: "FCO licence / registration no.", type: "text" },
    { key: "subsidy_scheme", label: "Subsidy scheme", type: "select", options: ["NBS", "Urea", "None"] },
    { key: "form", label: "Form", type: "select", options: ["Granular", "Liquid", "Powder", "Water soluble"] },
  ],
  PESTICIDE: [
    { key: "cib_reg_no", label: "CIB & RC registration no.", type: "text" },
    { key: "formulation", label: "Formulation", type: "select", options: ["SL", "SC", "EC", "WP", "WG", "SP", "DP", "GR", "OD", "ME"] },
    { key: "toxicity", label: "Toxicity label", type: "select", options: ["Green", "Blue", "Yellow", "Red"] },
    { key: "target_pest", label: "Target pest / disease", type: "text" },
    { key: "phi_days", label: "Pre-harvest interval (days)", type: "number" },
  ],
  EQUIPMENT: [
    { key: "model", label: "Model", type: "text", showOnBill: true },
    { key: "warranty_months", label: "Warranty (months)", type: "number" },
    { key: "power_source", label: "Power source", type: "select", options: ["Manual", "Battery", "Petrol", "Electric"] },
  ],
  OTHER: [{ key: "spec", label: "Specification", type: "text" }],
};

/** Problems with the attributes of a product against its category's fields */
export function validateAttributes(fields: FieldDef[] | null | undefined, attrs: Attributes | null | undefined): string[] {
  const errors: string[] = [];
  for (const f of fields ?? []) {
    const v = attrs?.[f.key];
    const empty = v === null || v === undefined || v === "";
    if (f.required && empty) errors.push(`${f.label} is required`);
    if (empty) continue;
    if (f.type === "number" && Number.isNaN(Number(v))) errors.push(`${f.label} must be a number`);
    if (f.type === "date" && Number.isNaN(Date.parse(String(v)))) errors.push(`${f.label} must be a date`);
    if (f.type === "select" && f.options?.length && !f.options.includes(String(v))) errors.push(`${f.label} must be one of ${f.options.join(", ")}`);
  }
  return errors;
}

/** Attribute values worth printing next to the product name */
export function billAttributes(fields: FieldDef[] | null | undefined, attrs: Attributes | null | undefined): string {
  return (fields ?? [])
    .filter((f) => f.showOnBill && attrs?.[f.key] !== undefined && attrs?.[f.key] !== null && attrs?.[f.key] !== "")
    .map((f) => (f.type === "yesno" ? f.label : String(attrs?.[f.key])))
    .join(" · ");
}
