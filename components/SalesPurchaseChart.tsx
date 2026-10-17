"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PURCHASE_COLOR, SALES_COLOR } from "@/lib/chart-colors";
import { inr0, inrCompact } from "@/lib/format";

// Theme-aware (light / dark): CSS variables from app/globals.css
const GRID = "var(--color-grid)";
const AXIS = "var(--color-muted)";

export interface TrendPoint {
  label: string;
  sales: number;
  purchases: number;
}

/**
 * Monthly sales vs purchase bars on the dashboard. Its own file so the chart library (recharts, the largest
 * dependency on the dashboard) is loaded separately, after the page itself — see LazySalesPurchaseChart.
 */
export default function SalesPurchaseChart({ data, showPurchases }: { data: TrendPoint[]; showPurchases: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: "var(--color-line-3)" }} />
        <YAxis tickFormatter={inrCompact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-paper-3)" }} />
        <Bar dataKey="sales" name="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={12} />
        {showPurchases && <Bar dataKey="purchases" name="Purchase" fill={PURCHASE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={12} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="num font-semibold text-ink">{inr0(p.value)}</span>
        </p>
      ))}
    </div>
  );
}
