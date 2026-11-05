// How offers (schemes) are named and described on the offers page and at the counter

import { round2 } from "./format";
import { offerLabel, remainingOf } from "./pricing";
import type { PurposeColor, Scheme, SchemeScope, SchemeType } from "./types";

/** What each calculation does, for picking it when adding an offer type */
export const SCHEME_TYPE_LABEL: Record<SchemeType, string> = {
  BUY_X_GET_Y: "Buy X Get Y Free",
  PCT_OFF: "% Off",
  UPTO_PCT_OFF: "Upto % Off (cashier gives up to the limit)",
  FLAT_OFF: "Flat ₹ Off per Unit",
  FIXED_PRICE: "Offer Price per Unit",
};

/** Badge colours a purpose can take */
export const PURPOSE_COLORS: { value: PurposeColor; label: string }[] = [
  { value: "slate", label: "Grey" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
];

/** Ribbon colours for the POS product tiles */
const RIBBON: Record<PurposeColor, string> = {
  slate: "bg-brand-600 text-white",
  green: "bg-brand-600 text-white",
  amber: "bg-amber-500 text-white",
  red: "bg-rust-600 text-white",
  blue: "bg-sky-600 text-white",
  violet: "bg-violet-600 text-white",
};

/** The offer's purpose name ("General" when none is set) */
export const purposeName = (s: Pick<Scheme, "purposeOption">) => s.purposeOption?.name ?? "General";
/** Badge tone of the offer's purpose */
export const purposeTone = (s: Pick<Scheme, "purposeOption">): PurposeColor => s.purposeOption?.color ?? "slate";
/** Ribbon classes of the offer's purpose on a POS tile */
export const purposeRibbon = (s: Pick<Scheme, "purposeOption">) => RIBBON[purposeTone(s)];
/** Whether the offer is for a festival (built-in Festival purpose) */
export const isFestival = (s: Pick<Scheme, "purposeOption">) => s.purposeOption?.code === "FESTIVAL";
/** The offer type's name ("% Off", "Diwali Combo", …), falling back to its calculation */
export const offerTypeName = (s: Pick<Scheme, "offerType" | "type">) => s.offerType?.name ?? SCHEME_TYPE_LABEL[s.type];

export const SCOPE_LABEL: Record<SchemeScope, string> = {
  PRODUCTS: "Chosen Products",
  CATEGORIES: "Whole Categories",
  ALL: "All Products",
};

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** "Buy 10 get 1 free", "5% off", "₹20 off", "₹399 offer price" */
export const describeScheme = (s: Scheme) => offerLabel(s);

/** The offer's conditions in a few words: "min 5 units · bill ≥ ₹2000 · 40 of 100 left" */
export function offerConditions(s: Scheme) {
  const parts: string[] = [];
  if (n(s.minQty) > 0) parts.push(`min ${round2(n(s.minQty))} units`);
  if (n(s.minBill) > 0) parts.push(`bill ≥ ₹${round2(n(s.minBill))}`);
  if (s.maxQty !== null && s.maxQty !== undefined) parts.push(`${round2(remainingOf(s))} of ${round2(n(s.maxQty))} left`);
  return parts.join(" · ");
}

/** What it covers: "All products", "Seeds, Fertiliser", "Mancozeb, …" */
export function offerCoverage(s: Scheme) {
  if (s.scope === "ALL") return s.excludeSubsidised ? "All products (not subsidised)" : "All products";
  if (s.scope === "CATEGORIES") return s.categories.map((c) => c.category?.name ?? c.categoryId).join(", ");
  return s.products.map((p) => p.product?.name ?? p.productId).join(", ");
}
