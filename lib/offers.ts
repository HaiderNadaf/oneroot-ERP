// How offers (schemes) are named and described on the offers page and at the counter

import { round2 } from "./format";
import { offerLabel, remainingOf } from "./pricing";
import type { OfferPurpose, Scheme, SchemeScope, SchemeType } from "./types";

export const SCHEME_TYPE_LABEL: Record<SchemeType, string> = {
  BUY_X_GET_Y: "Buy X Get Y Free",
  PCT_OFF: "% Off",
  FLAT_OFF: "Flat ₹ Off per Unit",
  FIXED_PRICE: "Offer Price per Unit",
};

export const PURPOSE_LABEL: Record<OfferPurpose, string> = {
  GENERAL: "General",
  FESTIVAL: "Festival",
  STOCK_CLEARANCE: "Stock Clearance",
  SEASONAL: "Seasonal",
  COMPANY: "Company Scheme",
  NEW_LAUNCH: "New Launch",
  BULK: "Bulk Buy",
};

/** Badge tone per purpose (matches the Badge component's tones) */
export const PURPOSE_TONE: Record<OfferPurpose, "slate" | "green" | "amber" | "red" | "blue" | "violet"> = {
  GENERAL: "slate",
  FESTIVAL: "amber",
  STOCK_CLEARANCE: "red",
  SEASONAL: "green",
  COMPANY: "blue",
  NEW_LAUNCH: "violet",
  BULK: "blue",
};

/** Ribbon colours for the POS product tiles */
export const PURPOSE_RIBBON: Record<OfferPurpose, string> = {
  GENERAL: "bg-brand-600 text-white",
  FESTIVAL: "bg-amber-500 text-white",
  STOCK_CLEARANCE: "bg-rust-600 text-white",
  SEASONAL: "bg-brand-600 text-white",
  COMPANY: "bg-sky-600 text-white",
  NEW_LAUNCH: "bg-violet-600 text-white",
  BULK: "bg-sky-600 text-white",
};

export const SCOPE_LABEL: Record<SchemeScope, string> = {
  PRODUCTS: "Chosen Products",
  CATEGORIES: "Whole Categories",
  ALL: "All Products",
};

/** Festivals and seasons offered as suggestions for the occasion */
export const OCCASIONS = [
  "Pongal",
  "Makar Sankranti",
  "Ugadi",
  "Tamil New Year",
  "Vishu",
  "Akshaya Tritiya",
  "Onam",
  "Ganesh Chaturthi",
  "Navratri",
  "Dussehra",
  "Diwali",
  "Christmas",
  "New Year",
  "Holi",
  "Eid",
  "Independence Day",
  "Kharif Season",
  "Rabi Season",
  "Year-End Clearance",
];

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
