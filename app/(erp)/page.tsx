"use client";

import {
  Boxes,
  Layers,
  Leaf,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CashReconciliationCard } from "@/components/CashReconciliationCard";
import { QuickActions } from "@/components/QuickActions";
import { ErrorBox, Spinner, StatusBadge, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, daysUntil, inr, inr0, inrCompact, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { modeLabel, type CashReconciliation, type PaymentMode, type PaymentStatus } from "@/lib/types";

type Period = "today" | "month" | "fy";

/** Side-by-side figures per branch (filled only when viewing All branches) */
interface BranchRow {
  id: string;
  code: string;
  name: string;
  sales: number;
  invoices: number;
  /** sales − GST − cost, before returns */
  margin: number;
  purchases: number;
  stockValue: number;
  dues: number;
}

interface Dashboard {
  period: Period;
  periodLabel: string;
  greetingName: string;
  kpis: {
    sales: { value: number; growth: number | null; invoices: number; grossProfit: number; netProfit: number };
    collected: { value: number; growth: number | null; pctOfSales: number | null };
    receivables: { value: number; customers: number; over30: number };
    purchases: { value: number; growth: number | null; bills: number; payables: number; payablesDueSoon: number };
  };
  spark: { label: string; sales: number; purchases: number; collected: number }[];
  alerts: {
    expiring7: number;
    expired: number;
    approvals: number;
    inwardDue: number;
    lowStock: number;
    grnsToInvoice: number;
    draftDebitNotes: number;
    govtMismatches: number;
    cashGaps: number;
    openShifts: number;
    approvalRequests: number;
    openVans?: number;
  };
  cash?: CashReconciliation;
  trend: { month: string; sales: number; purchases: number }[];
  byCategory: { category: string; amount: number }[];
  split?: { channels: { channel: "COUNTER" | "VAN"; total: number; bills: number }[]; modes: { mode: PaymentMode; amount: number }[]; credit: number };
  expiring: {
    id: string;
    batchNo: string;
    expiryDate: string;
    quantity: number;
    value: number;
    product: { id: string; name: string; unit: string; packSize: string | null };
    branch?: { code: string; name: string } | null;
  }[];
  approvals: {
    id: string;
    poNo: string;
    vendor: string;
    totalAmount: number;
    round: number;
    waitingAt: string;
    approverName: string | null;
    level: number;
    levels: number;
  }[];
  recentSales: {
    id: string;
    invoiceNo: string;
    saleDate: string;
    customerName: string | null;
    customer: { village: string | null } | null;
    totalAmount: string;
    paidAmount: string;
    paymentStatus: PaymentStatus;
    paymentMode: PaymentMode;
    _count: { items: number };
  }[];
  gst: { output: number; input: number; net: number; gstr1Due: string; gstr3bDue: string };
  topProducts: { productId: string; name: string; unit: string; packSize: string | null; quantity: number; amount: number }[];
  topDues: { id: string; name: string; phone: string | null; village: string | null; balance: number; creditLimit: number }[];
  counts: { customers: number; vendors: number; products: number; batches: number; openPos: number; users: number };
  /** null = all branches */
  branchId?: string | null;
  branches?: BranchRow[];
}

// Validated pair (dataviz check): green = sales, gold = purchases. Gold is light, so the chart always has a legend + tooltip.
const GREEN = "#2e8b46";
const GOLD = "#c9932a";
const GRID = "#e6eadf";
const AXIS = "#5f6e60";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Indian cropping season for the subtitle */
function season() {
  const m = new Date().getMonth() + 1;
  if (m >= 6 && m <= 9) return "Kharif season";
  if (m >= 10 || m <= 2) return "Rabi season stocking";
  return "Zaid season";
}

// ───────────────────────── Building blocks ─────────────────────────

function Panel({
  title,
  sub,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  footer?: { text: string; href?: string; link?: string };
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("flex flex-col overflow-hidden rounded-[10px] border border-[#e1e6d8] bg-white shadow-[0_1px_2px_rgba(20,40,25,.06),0_4px_14px_rgba(20,40,25,.05)]", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#e1e6d8] px-4 py-3">
        <div>
          <h3 className="text-[14.5px] font-bold text-[#1d2a1f]">{title}</h3>
          {sub && <p className="text-xs text-[#5f6e60]">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cx("flex-1", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e1e6d8] bg-[#f7f9f3] px-4 py-2.5 text-xs text-[#5f6e60]">
          <span>{footer.text}</span>
          {footer.href && (
            <Link href={footer.href} className="font-semibold text-brand-700 hover:underline">
              {footer.link} →
            </Link>
          )}
        </footer>
      )}
    </section>
  );
}

/** Tiny trend line for a KPI card; the full numbers are in the chart and reports */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2) return null;
  const w = 92;
  const h = 30;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" role="img" aria-label={label}>
      <title>{label}</title>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

function Trend({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span
      className={cx(
        "num rounded-full px-[7px] py-0.5 text-xs font-bold",
        good ? "bg-[#e3f1e3] text-[#2e8b46]" : "bg-[#fbe4df] text-[#c2412d]",
      )}
    >
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

function Kpi({
  label,
  value,
  growth,
  invertGrowth,
  sub,
  spark,
  color,
  href,
  periodWord,
}: {
  label: string;
  value: number;
  growth?: number | null;
  invertGrowth?: boolean;
  sub: ReactNode;
  spark?: number[];
  color: string;
  href: string;
  periodWord: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-[10px] border border-[#e1e6d8] bg-white px-4 pb-3 pt-3.5 shadow-[0_1px_2px_rgba(20,40,25,.06),0_4px_14px_rgba(20,40,25,.05)] transition-colors hover:border-brand-500"
    >
      <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-[#5f6e60]">
        {label}
        <Trend value={growth ?? null} invert={invertGrowth} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="num font-display text-[26px] font-bold tracking-tight text-[#1d2a1f]">{inrCompact(value)}</div>
        {spark && <Sparkline values={spark} color={color} label={`${label} trend over the last ${periodWord}`} />}
      </div>
      <div className="text-xs text-[#5f6e60]">{sub}</div>
    </Link>
  );
}

const ALERT_TONE = {
  bad: "border-l-[#c2412d] [&_b]:text-[#c2412d]",
  warn: "border-l-[#b7791f] [&_b]:text-[#b7791f]",
  info: "border-l-[#2a6f97] [&_b]:text-[#2a6f97]",
  ok: "border-l-[#2e8b46] [&_b]:text-[#2e8b46]",
};

function AlertTile({ n, label, tone, href }: { n: number; label: string; tone: keyof typeof ALERT_TONE; href: string }) {
  const calm = n === 0;
  return (
    <Link
      href={href}
      className={cx(
        "flex flex-col gap-0.5 rounded-[10px] border border-transparent border-l-4 bg-white px-3.5 py-3 transition-colors hover:border-[#e1e6d8]",
        calm ? "border-l-[#e1e6d8] [&_b]:text-slate-400" : ALERT_TONE[tone],
      )}
    >
      <b className="num font-display text-[22px] leading-tight">{n}</b>
      <span className="text-[12.3px] leading-snug text-[#5f6e60]">{label}</span>
    </Link>
  );
}

function ExpiryBadge({ d }: { d: string }) {
  const left = daysUntil(d) ?? 0;
  const tone = left <= 7 ? "bg-[#fbe4df] text-[#c2412d]" : left <= 30 ? "bg-[#fbefd9] text-[#b7791f]" : "bg-[#e0eef5] text-[#2a6f97]";
  return <span className={cx("num rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{left === 0 ? "today" : `${left} days`}</span>;
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
    <div className="rounded-lg border border-[#e1e6d8] bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-[#1d2a1f]">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[#5f6e60]">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="num font-semibold text-[#1d2a1f]">{inr0(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function pctOf(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

function CodeBadge({ code, title }: { code: string; title?: string }) {
  return (
    <span title={title} className="rounded bg-[#eef1e8] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#5f6e60]">
      {code}
    </span>
  );
}

/** One row per branch: sales share bar (single hue, relative to the top branch), margin, purchases, stock and dues */
function BranchPerformance({
  rows,
  periodLabel,
  finance,
  locked,
  onPick,
}: {
  rows: BranchRow[];
  periodLabel: string;
  finance: boolean;
  locked: boolean;
  onPick: (id: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => b.sales - a.sales);
  const top = Math.max(...rows.map((r) => r.sales), 1);
  const total = rows.reduce(
    (t, r) => ({
      sales: t.sales + r.sales,
      invoices: t.invoices + r.invoices,
      margin: t.margin + r.margin,
      purchases: t.purchases + r.purchases,
      stockValue: t.stockValue + r.stockValue,
      dues: t.dues + r.dues,
    }),
    { sales: 0, invoices: 0, margin: 0, purchases: 0, stockValue: 0, dues: 0 },
  );
  return (
    <Panel
      title="Branch performance"
      sub={`${periodLabel} · ${rows.length} branches${locked ? "" : " · pick a branch to open its dashboard"}`}
      footer={finance ? { text: "Gross margin = sales − GST − cost, before returns. Stock value and dues are as of today." } : undefined}
    >
      <div className="overflow-x-auto">
        <table className={cx("w-full", finance ? "min-w-[860px]" : "min-w-[560px]")}>
          <thead>
            <tr>
              <th className={th}>Branch</th>
              <th className={th}>Sales</th>
              <th className={cx(th, "text-right")}>Invoices</th>
              {finance && <th className={cx(th, "text-right")}>Gross margin</th>}
              {finance && <th className={cx(th, "text-right")}>Purchases</th>}
              {finance && <th className={cx(th, "text-right")}>Stock value</th>}
              <th className={cx(th, "text-right")}>Customer dues</th>
              {!locked && (
                <th className={th}>
                  <span className="sr-only">Open</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id} onClick={locked ? undefined : () => onPick(b.id)} className={cx("hover:bg-[#f7f9f3]", !locked && "cursor-pointer")}>
                <td className={td}>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-semibold text-[#1d2a1f]">{b.name}</span>
                    <CodeBadge code={b.code} />
                  </span>
                </td>
                <td className={cx(td, "min-w-[220px]")}>
                  <span
                    className="grid grid-cols-[1fr_auto] items-center gap-2.5"
                    title={`${b.name}: ${inr0(b.sales)} · ${pctOf(b.sales, total.sales)} of all sales`}
                  >
                    <span className="h-2 rounded-full bg-[#eef1e8]">
                      <span className="block h-2 rounded-full" style={{ width: `${(b.sales / top) * 100}%`, background: GREEN }} />
                    </span>
                    <span className="text-right">
                      <span className="num block font-semibold text-[#1d2a1f]">{inrCompact(b.sales)}</span>
                      <span className="num block text-[11px] text-[#5f6e60]">{pctOf(b.sales, total.sales)} share</span>
                    </span>
                  </span>
                </td>
                <td className={cx(td, "num text-right")}>{b.invoices.toLocaleString("en-IN")}</td>
                {finance && (
                  <td className={cx(td, "text-right")}>
                    <span className="num block font-semibold text-[#1d2a1f]">{inrCompact(b.margin)}</span>
                    <span className="num block text-[11px] text-[#5f6e60]">{pctOf(b.margin, b.sales)} of sales</span>
                  </td>
                )}
                {finance && <td className={cx(td, "num text-right")}>{inrCompact(b.purchases)}</td>}
                {finance && <td className={cx(td, "num text-right")}>{inrCompact(b.stockValue)}</td>}
                <td className={cx(td, "num text-right", b.dues > 0 ? "font-semibold text-[#c2412d]" : "text-[#5f6e60]")}>{inrCompact(b.dues)}</td>
                {!locked && (
                  <td className={cx(td, "text-right")}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(b.id);
                      }}
                      aria-label={`View ${b.name} dashboard`}
                      className="rounded-lg border border-[#e1e6d8] px-2.5 py-1 text-xs font-semibold text-[#1d2a1f] hover:border-brand-500"
                    >
                      View
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#f7f9f3] font-semibold text-[#1d2a1f]">
              <td className={td}>All branches</td>
              <td className={cx(td, "num text-right")}>{inrCompact(total.sales)}</td>
              <td className={cx(td, "num text-right")}>{total.invoices.toLocaleString("en-IN")}</td>
              {finance && (
                <td className={cx(td, "text-right")}>
                  <span className="num block">{inrCompact(total.margin)}</span>
                  <span className="num block text-[11px] font-normal text-[#5f6e60]">{pctOf(total.margin, total.sales)} of sales</span>
                </td>
              )}
              {finance && <td className={cx(td, "num text-right")}>{inrCompact(total.purchases)}</td>}
              {finance && <td className={cx(td, "num text-right")}>{inrCompact(total.stockValue)}</td>}
              <td className={cx(td, "num text-right", total.dues > 0 && "text-[#c2412d]")}>{inrCompact(total.dues)}</td>
              {!locked && <td className={td} />}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

const th = "px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#5f6e60] bg-[#f7f9f3] border-b border-[#e1e6d8]";
const td = "px-4 py-2.5 border-b border-[#eef1e8] text-[13px]";

// ───────────────────────── Page ─────────────────────────

export default function DashboardPage() {
  const { can } = useAuth();
  const { current, locked, setBranch } = useBranch();
  const [period, setPeriod] = useState<Period>("month");
  const [expTab, setExpTab] = useState<7 | 30 | 60>(30);
  const { data, error, loading, reload } = useApi<Dashboard>("/dashboard", { period });

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const k = data.kpis;
  const finance = can("reports.view");
  const periodWord = period === "today" ? "14 days" : "12 months";
  const sparkOf = (key: "sales" | "purchases" | "collected") => data.spark.map((s) => s[key]);
  const trend = data.trend.map((m) => ({
    ...m,
    label: new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
  }));
  const expRows = data.expiring.filter((b) => (daysUntil(b.expiryDate) ?? 999) <= expTab);
  const catMax = Math.max(...data.byCategory.map((c) => c.amount), 1);
  const branchRows = data.branches ?? [];
  // Prefer the server's view of the scope; fall back to the top-bar choice
  const scopedToBranch = data.branchId != null || current !== null;
  const scopeName = current?.name ?? (scopedToBranch ? "This branch" : "All branches");

  return (
    <div className={cx("space-y-[18px] transition-opacity", loading && "opacity-60")}>
      {/* Heading + period switch */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-[#5f6e60]">Dashboard</p>
          <h1 className="text-[26px] font-bold tracking-tight text-[#1d2a1f]">
            {greeting()}, {data.greetingName}
          </h1>
          <p className="text-[13px] text-[#5f6e60]">
            {scopeName} · {data.periodLabel} · {season()}
          </p>
        </div>
        <div role="tablist" aria-label="Period" className="inline-flex overflow-hidden rounded-[9px] border border-[#e1e6d8] bg-white">
          {(
            [
              ["today", "Today"],
              ["month", "This month"],
              ["fy", "This FY"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={period === v}
              onClick={() => setPeriod(v)}
              className={cx(
                "h-9 px-3 text-[13px] font-semibold transition-colors",
                period === v ? "bg-[#e3f1e3] text-[#2e8b46]" : "text-[#5f6e60] hover:bg-[#f7f9f3]",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions + "+" panel with every page */}
      <QuickActions />

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Sales"
          value={k.sales.value}
          growth={k.sales.growth}
          spark={sparkOf("sales")}
          color={GREEN}
          href="/sales"
          periodWord={periodWord}
          sub={
            finance
              ? `${k.sales.invoices} invoices · gross profit ${inrCompact(k.sales.grossProfit)}`
              : `${k.sales.invoices} invoices`
          }
        />
        <Kpi
          label="Collected"
          value={k.collected.value}
          growth={k.collected.growth}
          spark={sparkOf("collected")}
          color={GREEN}
          href="/payments"
          periodWord={periodWord}
          sub={k.collected.pctOfSales === null ? "Payments received" : `${k.collected.pctOfSales}% of billed value`}
        />
        <Kpi
          label="Receivables"
          value={k.receivables.value}
          color="#b7791f"
          href={finance ? "/reports?tab=outstanding" : "/customers"}
          periodWord={periodWord}
          sub={
            scopedToBranch
              ? `Unpaid bills in this branch · ${k.receivables.customers} customers · over 30 days: ${inrCompact(k.receivables.over30)}`
              : `${k.receivables.customers} customers · over 30 days: ${inrCompact(k.receivables.over30)}`
          }
        />
        {finance ? (
          <Kpi
            label="Purchase"
            value={k.purchases.value}
            growth={k.purchases.growth}
            spark={sparkOf("purchases")}
            color={GOLD}
            href="/purchases"
            periodWord={periodWord}
            sub={
              scopedToBranch
                ? `Unpaid bills in this branch ${inrCompact(k.purchases.payables)} · due in 7 days: ${inrCompact(k.purchases.payablesDueSoon)}`
                : `Payables ${inrCompact(k.purchases.payables)} · due in 7 days: ${inrCompact(k.purchases.payablesDueSoon)}`
            }
          />
        ) : (
          <Kpi label="Customers" value={data.counts.customers} color={GREEN} href="/customers" periodWord={periodWord} sub="Active farmers & dealers" />
        )}
      </section>

      {/* Needs attention */}
      <section aria-label="Needs attention" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <AlertTile n={data.alerts.approvalRequests ?? 0} label="Approval requests waiting" tone="warn" href="/approvals" />
        <AlertTile n={data.alerts.cashGaps ?? 0} label="Cash gaps not explained" tone="bad" href="/shifts" />
        <AlertTile n={data.alerts.govtMismatches ?? 0} label="Govt fertiliser mismatches" tone="bad" href="/inventory/govt-match" />
        <AlertTile n={data.alerts.expiring7} label="Batches expire in 7 days" tone="bad" href="/inventory" />
        <AlertTile n={data.alerts.expired} label="Expired batches in stock" tone="bad" href="/inventory" />
        <AlertTile n={data.alerts.approvals} label="POs awaiting approval" tone="warn" href="/purchase-orders/approvals" />
        <AlertTile n={data.alerts.inwardDue} label="POs waiting for goods inward" tone="warn" href="/goods-inward" />
        <AlertTile n={data.alerts.lowStock} label="Items below reorder level" tone="info" href="/inventory?tab=low" />
        <AlertTile n={data.alerts.grnsToInvoice} label="GRNs waiting for invoice" tone="info" href="/goods-inward" />
        <AlertTile n={data.alerts.openVans ?? 0} label="Vans on the road" tone="info" href="/van" />
      </section>

      {finance && data.cash && (data.cash.toDeposit > 0 || data.cash.openShifts > 0 || data.cash.unexplained > 0) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CashReconciliationCard cash={data.cash} />
        </section>
      )}

      {/* Branch comparison (All branches view only) */}
      {branchRows.length > 1 && (
        <BranchPerformance
          rows={branchRows}
          periodLabel={data.periodLabel}
          finance={finance}
          locked={locked}
          onPick={(id) => {
            if (!locked) setBranch(id);
          }}
        />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Sales vs purchase */}
        <Panel
          title="Sales vs purchase"
          sub="Last 12 months"
          className="lg:col-span-8"
          action={
            <div className="flex gap-3 text-xs text-[#5f6e60]">
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm" style={{ background: GREEN }} />
                Sales
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm" style={{ background: GOLD }} />
                Purchase
              </span>
            </div>
          }
          bodyClassName="p-4"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: "#c9d1c0" }} />
                <YAxis tickFormatter={inrCompact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f3f5ef" }} />
                <Bar dataKey="sales" name="Sales" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={16} />
                {finance && <Bar dataKey="purchases" name="Purchase" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={16} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Sales by category */}
        <Panel title="Sales by category" sub={data.periodLabel} className="lg:col-span-4" bodyClassName="p-4">
          {data.byCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sales in this period</p>
          ) : (
            <ul className="space-y-3">
              {data.byCategory.map((c) => (
                <li key={c.category} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-[#1d2a1f]">{c.category}</span>
                  <span className="h-2 rounded-full bg-[#eef1e8]">
                    <span className="block h-2 rounded-full" style={{ width: `${(c.amount / catMax) * 100}%`, background: GREEN }} />
                  </span>
                  <span className="num text-right font-semibold text-[#1d2a1f]">{inrCompact(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Where sales were made and how they were paid */}
        {data.split && <SplitPanel split={data.split} label={data.periodLabel} />}

        {/* Expiry watch */}
        <Panel
          title="Expiry watch"
          sub="Batches in stock, earliest expiry first"
          className="lg:col-span-7"
          action={
            <div className="flex gap-1 rounded-lg bg-[#f3f5ef] p-0.5">
              {([7, 30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setExpTab(d)}
                  className={cx(
                    "rounded-md px-2.5 py-1 text-xs font-semibold",
                    expTab === d ? "bg-white text-[#1d2a1f] shadow-sm" : "text-[#5f6e60] hover:text-[#1d2a1f]",
                  )}
                >
                  {d} days
                </button>
              ))}
            </div>
          }
          footer={{ text: `Alert window set in Store Settings`, href: "/inventory", link: "Open stock & batches" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Product / batch</th>
                  <th className={th}>Expiry</th>
                  <th className={th}>Left</th>
                  <th className={cx(th, "text-right")}>Qty</th>
                  {finance && <th className={cx(th, "text-right")}>Value</th>}
                </tr>
              </thead>
              <tbody>
                {expRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No batches expire in the next {expTab} days
                    </td>
                  </tr>
                ) : (
                  expRows.slice(0, 8).map((b) => (
                    <tr key={b.id} className="hover:bg-[#f7f9f3]">
                      <td className={td}>
                        <Link href={`/products/${b.product.id}`} className="font-semibold text-[#1d2a1f] hover:text-brand-700">
                          {b.product.name}
                        </Link>
                        <p className="text-xs text-[#5f6e60]">
                          {b.product.packSize ? `${b.product.packSize} · ` : ""}Batch {b.batchNo}
                          {!scopedToBranch && b.branch && (
                            <>
                              {" "}
                              <CodeBadge code={b.branch.code} title={b.branch.name} />
                            </>
                          )}
                        </p>
                      </td>
                      <td className={cx(td, "num whitespace-nowrap")}>{date(b.expiryDate)}</td>
                      <td className={td}>
                        <ExpiryBadge d={b.expiryDate} />
                      </td>
                      <td className={cx(td, "num text-right")}>
                        {qty(b.quantity)} {b.product.unit}
                      </td>
                      {finance && <td className={cx(td, "num text-right")}>{inr0(b.value)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* PO approvals */}
        <Panel
          title="PO approvals"
          sub="Waiting on approvers"
          className="lg:col-span-5"
          action={
            data.alerts.approvals > 0 ? (
              <span className="rounded-full bg-[#fbefd9] px-2.5 py-0.5 text-xs font-semibold text-[#b7791f]">{data.alerts.approvals} pending</span>
            ) : undefined
          }
          footer={{ text: "Limits set in PO Approval Rules", href: "/purchase-orders/approvals", link: "Review" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>PO / vendor</th>
                  <th className={cx(th, "text-right")}>Value</th>
                  <th className={th}>Waiting at</th>
                </tr>
              </thead>
              <tbody>
                {data.approvals.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                      Nothing waiting for approval
                    </td>
                  </tr>
                ) : (
                  data.approvals.map((p) => (
                    <tr key={p.id} className="hover:bg-[#f7f9f3]">
                      <td className={td}>
                        <Link href={`/purchase-orders/${p.id}`} className="font-semibold text-[#1d2a1f] hover:text-brand-700">
                          {p.poNo}
                        </Link>
                        <p className="text-xs text-[#5f6e60]">
                          {p.vendor}
                          {p.round > 1 && <span className="font-semibold text-[#c2412d]"> · Re-approval · round {p.round}</span>}
                        </p>
                      </td>
                      <td className={cx(td, "num text-right")}>{inr0(p.totalAmount)}</td>
                      <td className={td}>
                        <span className="whitespace-nowrap rounded-full bg-[#eef1e8] px-2 py-0.5 text-xs font-medium text-[#1d2a1f]">
                          {p.waitingAt} · {p.level} of {p.levels}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Recent sales */}
        <Panel
          title="Recent sales"
          sub="Latest invoices and POS bills"
          className={finance ? "lg:col-span-8" : "lg:col-span-12"}
          action={
            <Link href="/sales" className="rounded-lg border border-[#e1e6d8] px-2.5 py-1 text-xs font-semibold text-[#1d2a1f] hover:border-brand-500">
              View all
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Bill no.</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Payment</th>
                  <th className={cx(th, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                      No sales yet
                    </td>
                  </tr>
                ) : (
                  data.recentSales.map((s) => (
                    <tr key={s.id} className="hover:bg-[#f7f9f3]">
                      <td className={td}>
                        <Link href={`/sales/${s.id}`} className="font-semibold text-[#1d2a1f] hover:text-brand-700">
                          {s.invoiceNo}
                        </Link>
                        <p className="text-xs text-[#5f6e60]">
                          {date(s.saleDate)} · {s._count.items} item{s._count.items === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className={td}>
                        <p className="font-medium text-[#1d2a1f]">{s.customerName || "Walk-in"}</p>
                        {s.customer?.village && <p className="text-xs text-[#5f6e60]">{s.customer.village}</p>}
                      </td>
                      <td className={td}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={s.paymentStatus} />
                          <span className="text-xs text-[#5f6e60]">{s.paymentMode.toLowerCase()}</span>
                        </span>
                      </td>
                      <td className={cx(td, "num text-right font-semibold")}>{inr(s.totalAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* GST */}
        {finance && (
          <Panel
            title="GST this period"
            sub={`${data.periodLabel} · provisional`}
            className="lg:col-span-4"
            footer={{ text: "From invoices booked in the ERP", href: "/reports?tab=gst", link: "GST summary" }}
            bodyClassName="p-4"
          >
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9f3] p-3 text-center">
              <div>
                <p className="text-[11px] text-[#5f6e60]">Output GST</p>
                <p className="num font-display text-base font-bold">{inr0(data.gst.output)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#5f6e60]">Input credit</p>
                <p className="num font-display text-base font-bold">{inr0(data.gst.input)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#5f6e60]">{data.gst.net >= 0 ? "Net payable" : "Credit carried"}</p>
                <p className={cx("num font-display text-base font-bold", data.gst.net >= 0 ? "text-[#b7791f]" : "text-[#2e8b46]")}>
                  {inr0(Math.abs(data.gst.net))}
                </p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-[#eef1e8] text-[13px]">
              {[
                ["GSTR-1 (outward supplies)", data.gst.gstr1Due],
                ["GSTR-3B (summary return)", data.gst.gstr3bDue],
              ].map(([l, d]) => {
                const left = daysUntil(d) ?? 0;
                return (
                  <li key={l} className="flex items-center justify-between py-2">
                    <span className="text-[#1d2a1f]">{l}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        left <= 3 ? "bg-[#fbe4df] text-[#c2412d]" : left <= 10 ? "bg-[#fbefd9] text-[#b7791f]" : "bg-[#e0eef5] text-[#2a6f97]",
                      )}
                    >
                      Due {new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {/* Top moving products */}
        <Panel title="Top moving products" sub={`${data.periodLabel} · quantity sold`} className="lg:col-span-6">
          <table className="w-full">
            <tbody>
              {data.topProducts.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-400">No sales in this period</td>
                </tr>
              ) : (
                data.topProducts.map((t, i) => (
                  <tr key={t.productId} className="hover:bg-[#f7f9f3]">
                    <td className={cx(td, "num w-8 text-[#5f6e60]")}>{i + 1}</td>
                    <td className={td}>
                      <Link href={`/products/${t.productId}`} className="font-semibold text-[#1d2a1f] hover:text-brand-700">
                        {t.name}
                      </Link>
                      <p className="text-xs text-[#5f6e60]">
                        {t.packSize ? `${t.packSize} · ` : ""}
                        {inr0(t.amount)}
                      </p>
                    </td>
                    <td className={cx(td, "num text-right")}>
                      <b>{qty(t.quantity)}</b> <span className="text-xs text-[#5f6e60]">{t.unit}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>

        {/* Customer dues */}
        <Panel
          title="Dues to collect"
          sub="Customers with the highest balance"
          className="lg:col-span-6"
          footer={{
            text: `${k.receivables.customers} customers owe ${inr0(k.receivables.value)}`,
            href: finance ? "/reports?tab=outstanding" : "/customers",
            link: finance ? "Outstanding report" : "All customers",
          }}
        >
          <table className="w-full">
            <tbody>
              {data.topDues.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-400">No customer dues</td>
                </tr>
              ) : (
                data.topDues.map((c) => {
                  const over = c.creditLimit > 0 && c.balance > c.creditLimit;
                  return (
                    <tr key={c.id} className="hover:bg-[#f7f9f3]">
                      <td className={td}>
                        <Link href={`/customers/${c.id}`} className="font-semibold text-[#1d2a1f] hover:text-brand-700">
                          {c.name}
                        </Link>
                        <p className="text-xs text-[#5f6e60]">{[c.village, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className={cx(td, "text-right")}>
                        <p className="num font-semibold text-[#c2412d]">{inr0(c.balance)}</p>
                        {over && <p className="text-[11px] text-[#c2412d]">over credit limit</p>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* Counts */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["/customers", <Users key="i" />, data.counts.customers, "Farmers & dealers"],
            ["/vendors", <Truck key="i" />, data.counts.vendors, "Vendors"],
            ["/products", <Leaf key="i" />, data.counts.products, "Active products"],
            ["/inventory", <Layers key="i" />, data.counts.batches, "Batches in stock"],
            ["/purchase-orders", <Boxes key="i" />, data.counts.openPos, "Open purchase orders"],
            [can("admin.users") ? "/admin/users" : "/account", <UserCog key="i" />, data.counts.users, "Active users"],
          ] as const
        ).map(([href, icon, value, label]) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-3 rounded-[10px] border border-[#e1e6d8] bg-white px-3.5 py-3 transition-colors hover:border-brand-500"
          >
            <span className="rounded-lg bg-[#e3f1e3] p-2 text-[#2e8b46] [&>svg]:size-4">{icon}</span>
            <span>
              <b className="num block font-display text-lg leading-tight text-[#1d2a1f]">{value.toLocaleString("en-IN")}</b>
              <span className="text-xs text-[#5f6e60]">{label}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

const CHANNEL_LABEL = { COUNTER: "Counter", VAN: "Van trips" } as const;
const MODE_COLORS = ["#2f7d3a", "#c9932a", "#3b82c4", "#8b5cf6", "#0d9488", "#e07a5f", "#94a3b8", "#64748b"];

/** Sales by channel (counter / van) and money in by payment mode, with what went on credit */
function SplitPanel({ split, label }: { split: NonNullable<Dashboard["split"]>; label: string }) {
  const totalSales = split.channels.reduce((s, c) => s + c.total, 0);
  const modes = [...split.modes.filter((m) => m.amount > 0), ...(split.credit > 0 ? [{ mode: "CREDIT" as PaymentMode, amount: split.credit }] : [])];
  const totalModes = modes.reduce((s, m) => s + m.amount, 0);
  return (
    <Panel title="Sales by channel & payment mode" sub={label} className="lg:col-span-12" bodyClassName="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5f6e60]">Channel</p>
        {totalSales === 0 ? (
          <p className="py-4 text-sm text-slate-400">No sales in this period</p>
        ) : (
          <ul className="space-y-2.5">
            {split.channels.map((c) => (
              <li key={c.channel} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2.5 text-[13px]">
                <span className="text-[#1d2a1f]">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                <span className="h-2 rounded-full bg-[#eef1e8]">
                  <span className="block h-2 rounded-full" style={{ width: `${(c.total / totalSales) * 100}%`, background: c.channel === "VAN" ? "#3b82c4" : GREEN }} />
                </span>
                <span className="num text-right">
                  <b className="text-[#1d2a1f]">{inrCompact(c.total)}</b>
                  <span className="ml-1 text-xs text-[#5f6e60]">
                    {Math.round((c.total / totalSales) * 100)}% · {c.bills} bill{c.bills === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#5f6e60]">Payment mode</p>
        {totalModes === 0 ? (
          <p className="py-4 text-sm text-slate-400">No money in yet</p>
        ) : (
          <>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-[#eef1e8]">
              {modes.map((m, i) => (
                <span key={m.mode} title={`${modeLabel(m.mode)} ${inrCompact(m.amount)}`} style={{ width: `${(m.amount / totalModes) * 100}%`, background: m.mode === "CREDIT" ? "#d97706" : MODE_COLORS[i % MODE_COLORS.length] }} />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {modes.map((m, i) => (
                <li key={m.mode} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[#1d2a1f]">
                    <span className="size-2.5 rounded-sm" style={{ background: m.mode === "CREDIT" ? "#d97706" : MODE_COLORS[i % MODE_COLORS.length] }} />
                    {m.mode === "CREDIT" ? "On credit (unpaid)" : modeLabel(m.mode)}
                  </span>
                  <span className="num font-semibold text-[#1d2a1f]">{inrCompact(m.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
