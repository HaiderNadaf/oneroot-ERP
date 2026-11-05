// Counter pricing rules, mirrored from the server (backend/src/pricing): the cashier's discount, then the
// best offer per line, then the customer-type discount. The server's figures are final; this is the preview.

import { round2 } from "./format";

export interface SchemeLite {
  id: string;
  name: string;
  type: "BUY_X_GET_Y" | "PCT_OFF" | "UPTO_PCT_OFF" | "FLAT_OFF" | "FIXED_PRICE";
  scope?: "PRODUCTS" | "CATEGORIES" | "ALL";
  buyQty?: number | null;
  freeQty?: number | null;
  pct?: unknown;
  flat?: unknown;
  price?: unknown;
  minQty?: unknown;
  minBill?: unknown;
  maxQty?: unknown;
  usedQty?: number;
  excludeSubsidised?: boolean;
  products: { productId: string }[];
  categories?: { categoryId: string }[];
}

export interface CustomerTypeLite {
  name: string;
  discountPct: unknown;
  minBill: unknown;
  excludeSubsidised: boolean;
  isActive: boolean;
}

export interface PriceLineInput {
  productId: string;
  categoryId?: string | null;
  quantity: number;
  rate: number;
  manualPct: number;
  isSubsidised: boolean;
}

export interface PricedLine extends PriceLineInput {
  schemeId: string | null;
  schemeName: string | null;
  schemePct: number;
  freeQty: number;
  /** Units still needed before the next free one (buy-X-get-Y) */
  toNextFree: number | null;
  /** An offer the line just misses, for the cashier to tell the farmer ("2 more for 10% off") */
  hint: string | null;
  /** Most % an upto-% offer lets the cashier give on this line without a manager (0 = none) */
  uptoPct: number;
  /** That upto-% offer's name */
  uptoName: string | null;
  typePct: number;
  effectivePct: number;
}

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const fmt = (v: number) => String(round2(v));

/** Discounts that apply one after another, as one percentage */
export const combinePct = (...pcts: number[]) => round2(100 * (1 - pcts.reduce((f, p) => f * (1 - Math.min(100, Math.max(0, p)) / 100), 1)));

/** What is left of the cashier's discount once an upto-% offer has covered `schemePct` of it */
export const manualLeft = (manualPct: number, schemePct: number) =>
  schemePct >= 100 ? 0 : Math.max(0, round2(100 * (1 - (1 - Math.min(100, Math.max(0, manualPct)) / 100) / (1 - schemePct / 100))));

/** Whether an offer covers a product (by product, by category or the whole store) */
export function covers(s: SchemeLite, p: { productId: string; categoryId?: string | null; isSubsidised: boolean }) {
  if (s.excludeSubsidised && p.isSubsidised) return false;
  if (s.scope === "ALL") return true;
  if (s.scope === "CATEGORIES") return !!p.categoryId && !!s.categories?.some((c) => c.categoryId === p.categoryId);
  return s.products.some((x) => x.productId === p.productId);
}

/** Units a stock-limited offer may still cover */
export const remainingOf = (s: SchemeLite) => (s.maxQty === null || s.maxQty === undefined || s.maxQty === "" ? Infinity : Math.max(0, n(s.maxQty) - (s.usedQty ?? 0)));

/** What one offer is worth on a line; `units` is how many of the line's units its stock limit lets it cover */
function offerValue(s: SchemeLite, quantity: number, rate: number, units: number, manualPct: number) {
  let value = 0;
  let freeQty = 0;
  let toNextFree: number | null = null;
  if (s.type === "PCT_OFF") value = units * rate * (n(s.pct) / 100);
  // Upto % off: the discount the cashier typed, as far as the offer's limit
  else if (s.type === "UPTO_PCT_OFF") value = units * rate * (Math.min(Math.max(0, manualPct), n(s.pct)) / 100);
  else if (s.type === "FLAT_OFF") value = units * Math.min(n(s.flat), rate);
  else if (s.type === "FIXED_PRICE") value = units * Math.max(0, rate - n(s.price));
  else if (s.buyQty && s.freeQty) {
    freeQty = Math.floor(units / s.buyQty) * s.freeQty;
    value = freeQty * rate;
    toNextFree = s.buyQty - (units % s.buyQty);
    if (toNextFree === s.buyQty) toNextFree = units === 0 ? s.buyQty : 0;
  }
  const pct = s.type !== "BUY_X_GET_Y" && quantity * rate > 0 ? Math.min(100, round2((value / (quantity * rate)) * 100)) : 0;
  return { value, pct, freeQty, toNextFree };
}

/** Short label of what an offer gives: "10% off", "₹399 offer price", "Buy 10 get 1 free" */
export function offerLabel(s: SchemeLite) {
  if (s.type === "BUY_X_GET_Y") return `Buy ${s.buyQty} get ${s.freeQty} free`;
  if (s.type === "PCT_OFF") return `${fmt(n(s.pct))}% off`;
  if (s.type === "UPTO_PCT_OFF") return `Upto ${fmt(n(s.pct))}% off`;
  if (s.type === "FLAT_OFF") return `₹${fmt(n(s.flat))} off`;
  return `₹${fmt(n(s.price))} offer price`;
}

export function priceLines(items: PriceLineInput[], schemes: SchemeLite[], type: CustomerTypeLite | null | undefined) {
  const t = type && type.isActive && n(type.discountPct) > 0 ? type : null;
  // Bill-value conditions are checked against the bill after the cashier's discount
  const billBase = items.reduce((s, i) => s + i.quantity * i.rate * (1 - Math.min(100, Math.max(0, i.manualPct)) / 100), 0);
  const left = new Map(schemes.map((s) => [s.id, remainingOf(s)]));
  const lines: PricedLine[] = items.map((i) => {
    let best: { scheme: SchemeLite; value: number; pct: number; freeQty: number; toNextFree: number | null; units: number } | null = null;
    let hint: { text: string; worth: number } | null = null;
    let upto: { pct: number; name: string } | null = null;
    for (const s of schemes) {
      if (!covers(s, i)) continue;
      const units = Math.min(i.quantity, left.get(s.id) ?? Infinity);
      if (units <= 0 && i.quantity > 0) continue;
      const qtyShort = n(s.minQty) - i.quantity;
      const billShort = n(s.minBill) - billBase;
      if (qtyShort > 1e-9 || billShort > 0.004) {
        // Not reached yet: remember the nearest one to tell the farmer
        const worth = offerValue(s, Math.max(i.quantity, n(s.minQty)), i.rate, Math.max(units, n(s.minQty)), i.manualPct).value;
        const text = qtyShort > 1e-9 ? `${fmt(qtyShort)} more for ${offerLabel(s)}` : `Bill ₹${Math.ceil(billShort)} more for ${offerLabel(s)}`;
        if (!hint || worth > hint.worth) hint = { text: `${text} (${s.name})`, worth };
        continue;
      }
      if (s.type === "UPTO_PCT_OFF" && (!upto || n(s.pct) > upto.pct)) upto = { pct: n(s.pct), name: s.name };
      const v = offerValue(s, i.quantity, i.rate, units, i.manualPct);
      // A buy-X-get-Y offer stays visible even before the first free unit, so the cashier can tell the farmer
      const eligible = v.value > 0 || (s.type === "BUY_X_GET_Y" && !best);
      if (eligible && (!best || v.value > best.value)) best = { scheme: s, ...v, units };
    }
    if (best && best.value > 0) left.set(best.scheme.id, (left.get(best.scheme.id) ?? Infinity) - best.units);
    const viaUpto = best?.scheme.type === "UPTO_PCT_OFF" && best.value > 0;
    return {
      ...i,
      // An upto-% offer covers the cashier's discount up to its limit; only the rest counts as the cashier's own
      manualPct: viaUpto && best ? manualLeft(i.manualPct, best.pct) : i.manualPct,
      uptoPct: upto?.pct ?? 0,
      uptoName: upto?.name ?? null,
      schemeId: best?.scheme.id ?? null,
      schemeName: best?.scheme.name ?? null,
      schemePct: best?.pct ?? 0,
      freeQty: best?.freeQty ?? 0,
      toNextFree: best?.toNextFree ?? null,
      hint: hint && (!best || hint.worth > best.value) ? hint.text : null,
      typePct: 0,
      effectivePct: 0,
    };
  });
  const afterSchemes = lines.reduce((s, l) => s + l.quantity * l.rate * (1 - combinePct(l.manualPct, l.schemePct) / 100), 0);
  const typeApplied = !!t && afterSchemes + 0.004 >= n(t.minBill);
  for (const l of lines) {
    l.typePct = typeApplied && t && !(t.excludeSubsidised && l.isSubsidised) ? n(t.discountPct) : 0;
    l.effectivePct = combinePct(l.manualPct, l.schemePct, l.typePct);
  }
  return { lines, typeApplied, typeName: t?.name ?? null, minBill: t ? n(t.minBill) : 0 };
}
