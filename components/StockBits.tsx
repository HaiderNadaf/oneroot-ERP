"use client";

import Link from "next/link";
import { daysUntil, n, qty } from "@/lib/format";
import type { MovementType, StockMovement } from "@/lib/types";
import { Badge, cx } from "./ui";

/** Batches expiring within this many days are flagged amber */
export const EXPIRY_WARN_DAYS = 60;

/** "Expired 4d ago" (red) / "12 days left" (amber within 60 days) / "240 days" (neutral) */
export function ExpiryBadge({ expiry, warnDays = EXPIRY_WARN_DAYS }: { expiry?: string | null; warnDays?: number }) {
  const d = daysUntil(expiry);
  if (d === null) return <span className="text-xs text-slate-400">No expiry</span>;
  if (d < 0) return <Badge tone="red">Expired {Math.abs(d)}d ago</Badge>;
  if (d === 0) return <Badge tone="red">Expires today</Badge>;
  if (d <= warnDays) return <Badge tone="amber">{d}d left</Badge>;
  return <span className="text-xs text-slate-500">{d}d left</span>;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Purchase return",
  SALE: "Sale",
  SALE_RETURN: "Sale return",
  ADJUSTMENT_IN: "Stock added",
  ADJUSTMENT_OUT: "Stock removed",
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABEL) as MovementType[];

const movementTone: Record<MovementType, "slate" | "green" | "amber" | "red" | "blue" | "violet"> = {
  OPENING: "slate",
  PURCHASE: "green",
  PURCHASE_RETURN: "amber",
  SALE: "blue",
  SALE_RETURN: "violet",
  ADJUSTMENT_IN: "green",
  ADJUSTMENT_OUT: "amber",
  EXPIRED: "red",
  DAMAGED: "red",
  TRANSFER_IN: "violet",
  TRANSFER_OUT: "violet",
};

export function MovementBadge({ type }: { type: MovementType }) {
  return <Badge tone={movementTone[type]}>{MOVEMENT_LABEL[type]}</Badge>;
}

/** Reference number linking back to the sale / purchase that caused the movement */
export function MovementRef({ m }: { m: Pick<StockMovement, "refType" | "refId" | "refNo"> }) {
  if (!m.refNo) return <span className="text-slate-400">{m.refType === "ADJUSTMENT" ? "Adjustment" : "—"}</span>;
  const href =
    m.refId && (m.refType === "SALE" || m.refType === "SALE_RETURN")
      ? `/sales/${m.refId}`
      : m.refId && m.refType === "PURCHASE"
        ? `/purchases/${m.refId}`
        : m.refType === "TRANSFER"
          ? "/inventory?tab=transfers"
          : null;
  return href ? (
    <Link href={href} className="font-medium text-brand-700 hover:underline">
      {m.refNo}
    </Link>
  ) : (
    <span>{m.refNo}</span>
  );
}

/** Signed quantity: green "+12" for stock in, red "−4" for stock out */
export function SignedQty({ value, unit }: { value: unknown; unit?: string }) {
  const v = n(value);
  return (
    <span className={cx("num font-medium", v >= 0 ? "text-brand-700" : "text-red-600")}>
      {v >= 0 ? "+" : "−"}
      {qty(Math.abs(v))}
      {unit && <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>}
    </span>
  );
}
