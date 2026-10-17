"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { daysUntil, n, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { MovementType, StockMovement } from "@/lib/types";
import { Badge, cx } from "./ui";

/** Batches expiring within this many days are flagged amber */
export const EXPIRY_WARN_DAYS = 60;

/** "Expired 4d ago" (red) / "12 days left" (amber within 60 days) / "240 days" (neutral) */
export function ExpiryBadge({ expiry, warnDays = EXPIRY_WARN_DAYS }: { expiry?: string | null; warnDays?: number }) {
  const d = daysUntil(expiry);
  if (d === null) return <span className="text-xs text-slate-400">No expiry</span>;
  if (d < 0) return <Badge tone="red">Expired {Math.abs(d)}d ago</Badge>;
  if (d === 0) return <Badge tone="red">Expires Today</Badge>;
  if (d <= warnDays) return <Badge tone="amber">{d}d left</Badge>;
  return <span className="text-xs text-slate-500">{d}d left</span>;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  OPENING: "Opening",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Purchase Return",
  SALE: "Sale",
  SALE_RETURN: "Sale Return",
  ADJUSTMENT_IN: "Stock Added",
  ADJUSTMENT_OUT: "Stock Removed",
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
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
  const { can } = useAuth();
  if (!m.refNo) return <span className="text-slate-400">{m.refType === "ADJUSTMENT" ? "Adjustment" : "—"}</span>;
  // Plain text when the user can't open the page it points to
  const href =
    m.refId && (m.refType === "SALE" || m.refType === "SALE_RETURN")
      ? can("sales.bill") ? `/sales/${m.refId}` : null
      : m.refId && m.refType === "PURCHASE"
        ? can("purchases.view") ? `/purchases/${m.refId}` : null
        : m.refType === "TRANSFER" && can("inventory.view")
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

/** Cost prices (purchase rate, batch cost, margin, value at cost) follow the role's authority limits (Admin → Roles & Limits) */
export function useSeeCostPrice() {
  const { can } = useAuth();
  const { data: limits } = useApi<{ seeCostPrice: boolean }>("/roles/mine");
  return limits ? limits.seeCostPrice : can("purchases.view");
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
