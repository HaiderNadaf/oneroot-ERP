// Counter pricing rules, mirrored from the server (backend/src/pricing): the cashier's discount, then the
// best scheme per line, then the customer-type discount. The server's figures are final; this is the preview.

import { round2 } from "./format";

export interface SchemeLite {
  id: string;
  name: string;
  type: "BUY_X_GET_Y" | "PCT_OFF" | "FLAT_OFF";
  buyQty?: number | null;
  freeQty?: number | null;
  pct?: unknown;
  flat?: unknown;
  products: { productId: string }[];
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
  typePct: number;
  effectivePct: number;
}

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** Discounts that apply one after another, as one percentage */
export const combinePct = (...pcts: number[]) => round2(100 * (1 - pcts.reduce((f, p) => f * (1 - Math.min(100, Math.max(0, p)) / 100), 1)));

function bestScheme(schemes: SchemeLite[], productId: string, quantity: number, rate: number) {
  let best: { scheme: SchemeLite; value: number; pct: number; freeQty: number; toNextFree: number | null } | null = null;
  for (const s of schemes) {
    if (!s.products.some((p) => p.productId === productId)) continue;
    let value = 0;
    let pct = 0;
    let freeQty = 0;
    let toNextFree: number | null = null;
    if (s.type === "PCT_OFF") {
      pct = n(s.pct);
      value = quantity * rate * (pct / 100);
    } else if (s.type === "FLAT_OFF") {
      const off = Math.min(n(s.flat), rate);
      pct = rate > 0 ? round2((off / rate) * 100) : 0;
      value = quantity * off;
    } else if (s.buyQty && s.freeQty) {
      freeQty = Math.floor(quantity / s.buyQty) * s.freeQty;
      value = freeQty * rate;
      toNextFree = s.buyQty - (quantity % s.buyQty);
      if (toNextFree === s.buyQty) toNextFree = quantity === 0 ? s.buyQty : 0;
    }
    // A buy-X-get-Y scheme stays visible even before the first free unit, so the cashier can tell the farmer
    const eligible = value > 0 || (s.type === "BUY_X_GET_Y" && !best);
    if (eligible && (!best || value > best.value)) best = { scheme: s, value, pct, freeQty, toNextFree };
  }
  return best;
}

export function priceLines(items: PriceLineInput[], schemes: SchemeLite[], type: CustomerTypeLite | null | undefined) {
  const t = type && type.isActive && n(type.discountPct) > 0 ? type : null;
  const lines: PricedLine[] = items.map((i) => {
    const best = bestScheme(schemes, i.productId, i.quantity, i.rate);
    return {
      ...i,
      schemeId: best?.scheme.id ?? null,
      schemeName: best?.scheme.name ?? null,
      schemePct: best?.pct ?? 0,
      freeQty: best?.freeQty ?? 0,
      toNextFree: best?.toNextFree ?? null,
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
