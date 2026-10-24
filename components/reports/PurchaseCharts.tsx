"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CURRENT_COLOR, PREVIOUS_COLOR } from "@/lib/chart-colors";
import { inr0, inrCompact, qty } from "@/lib/format";

// Theme-aware (light / dark): CSS variables from app/globals.css
const GRID = "var(--color-grid)";
const AXIS = "var(--color-muted)";
const AXIS_LINE = "var(--color-line-3)";

/**
 * Charts for the PO / GRN reports. Their own file so the chart library is loaded separately, after the report
 * itself — see the dynamic imports in PurchaseReports.
 */

export interface RankPoint {
  name: string;
  value: number;
  count: number;
  quantity?: number;
  unit?: string;
}

/** Top products / vendors by value: horizontal bars (room for long names), one series, so no legend */
export function RankBarChart({ data, countLabel }: { data: RankPoint[]; countLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34 + 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={inrCompact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: AXIS_LINE }} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip content={<RankTooltip countLabel={countLabel} />} cursor={{ fill: "var(--color-paper-3)" }} />
        <Bar dataKey="value" name="Value" fill={CURRENT_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RankTooltip({ active, payload, countLabel }: { active?: boolean; payload?: { payload: RankPoint }[]; countLabel: string }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 max-w-64 font-semibold text-ink">{p.name}</p>
      <p className="text-muted">
        Value: <span className="num font-semibold text-ink">{inr0(p.value)}</span>
      </p>
      {p.quantity !== undefined && p.quantity > 0 && (
        <p className="text-muted">
          Quantity:{" "}
          <span className="num font-semibold text-ink">
            {qty(p.quantity)}
            {p.unit ? ` ${p.unit}` : ""}
          </span>
        </p>
      )}
      <p className="text-muted">
        {countLabel}: <span className="num font-semibold text-ink">{p.count}</span>
      </p>
    </div>
  );
}

export interface MonthPoint {
  label: string;
  value: number;
  count: number;
}

/** Value per month for the last 12 months: one series, so no legend */
export function MonthColumnChart({ data, countLabel }: { data: MonthPoint[]; countLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: AXIS_LINE }} />
        <YAxis tickFormatter={inrCompact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<MonthTooltip countLabel={countLabel} />} cursor={{ fill: "var(--color-paper-3)" }} />
        <Bar dataKey="value" name="Value" fill={CURRENT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthTooltip({ active, payload, countLabel }: { active?: boolean; payload?: { payload: MonthPoint }[]; countLabel: string }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{p.label}</p>
      <p className="text-muted">
        Value: <span className="num font-semibold text-ink">{inr0(p.value)}</span>
      </p>
      <p className="text-muted">
        {countLabel}: <span className="num font-semibold text-ink">{p.count}</span>
      </p>
    </div>
  );
}

export interface ComparePoint {
  day: number;
  current: number | null;
  previous: number | null;
}

/**
 * Running total through the month: this month (solid) against last month (dashed). Two series, so a legend sits
 * above the plot, and the dash keeps them apart without relying on colour.
 */
export function CompareLineChart({ data, currentLabel, previousLabel }: { data: ComparePoint[]; currentLabel: string; previousLabel: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded" style={{ background: CURRENT_COLOR }} />
          {currentLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} />
          {previousLabel}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: AXIS_LINE }} interval="preserveStartEnd" />
            <YAxis tickFormatter={inrCompact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<CompareTooltip currentLabel={currentLabel} previousLabel={previousLabel} />} cursor={{ stroke: AXIS_LINE }} />
            <Line type="monotone" dataKey="previous" name={previousLabel} stroke={PREVIOUS_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
            <Line type="monotone" dataKey="current" name={currentLabel} stroke={CURRENT_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompareTooltip({
  active,
  payload,
  label,
  currentLabel,
  previousLabel,
}: {
  active?: boolean;
  payload?: { payload: ComparePoint }[];
  label?: number;
  currentLabel: string;
  previousLabel: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">Day {label} · running total</p>
      {p.current !== null && (
        <p className="flex items-center gap-2 text-muted">
          <span className="h-0.5 w-3 rounded" style={{ background: CURRENT_COLOR }} />
          {currentLabel}: <span className="num font-semibold text-ink">{inr0(p.current)}</span>
        </p>
      )}
      {p.previous !== null && (
        <p className="flex items-center gap-2 text-muted">
          <span className="w-3 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} />
          {previousLabel}: <span className="num font-semibold text-ink">{inr0(p.previous)}</span>
        </p>
      )}
    </div>
  );
}
