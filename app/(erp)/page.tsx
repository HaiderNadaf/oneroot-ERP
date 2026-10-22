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
import { canOpenPath } from "@/components/AppShell";
import { CashReconciliationCard } from "@/components/CashReconciliationCard";
import { LazySalesPurchaseChart } from "@/components/lazy";
import { ErrorBox, Spinner, StatusBadge, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, daysUntil, inr, inr0, inrCompact, qty } from "@/lib/format";
import { PURCHASE_COLOR, SALES_COLOR } from "@/lib/chart-colors";
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

/**
 * The API leaves out what the user's permissions don't cover: null sections and counts, empty lists, and zeros for
 * withheld series and cost columns.
 */
interface Dashboard {
  period: Period;
  periodLabel: string;
  greetingName: string;
  kpis: {
    sales: { value: number; growth: number | null; invoices: number; grossProfit: number | null; netProfit: number | null } | null;
    collected: { value: number; growth: number | null; pctOfSales: number | null } | null;
    receivables: { value: number; customers: number; over30: number } | null;
    purchases: { value: number; growth: number | null; bills: number; payables: number; payablesDueSoon: number } | null;
  };
  spark: { label: string; sales: number; purchases: number; collected: number }[];
  alerts: {
    expiring7: number | null;
    expired: number | null;
    approvals: number | null;
    inwardDue: number | null;
    lowStock: number | null;
    grnsToInvoice: number | null;
    draftDebitNotes: number | null;
    govtMismatches: number | null;
    cashGaps: number | null;
    openShifts: number | null;
    approvalRequests: number | null;
    openVans?: number | null;
  };
  cash?: CashReconciliation | null;
  trend: { month: string; sales: number; purchases: number }[];
  byCategory: { category: string; amount: number }[];
  split?: { channels: { channel: "COUNTER" | "VAN"; total: number; bills: number }[]; modes: { mode: PaymentMode; amount: number }[]; credit: number } | null;
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
  gst: { output: number; input: number; net: number; gstr1Due: string; gstr3bDue: string } | null;
  topProducts: { productId: string; name: string; unit: string; packSize: string | null; quantity: number; amount: number }[];
  topDues: { id: string; name: string; phone: string | null; village: string | null; balance: number; creditLimit: number }[];
  counts: { customers: number | null; vendors: number | null; products: number | null; batches: number | null; openPos: number | null; users: number | null };
  /** null = all branches */
  branchId?: string | null;
  branches?: BranchRow[];
}

// Sales green / purchase gold, shared with the chart (lib/chart-colors.ts)
const GREEN = SALES_COLOR;
const GOLD = PURCHASE_COLOR;

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
    <section className={cx("flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(20,40,25,.06),0_4px_14px_rgba(20,40,25,.05)]", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cx("flex-1", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper-2 px-4 py-2.5 text-xs text-muted">
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
        good ? "bg-leaf-100 text-leaf-600" : "bg-rust-100 text-rust-600",
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
  count,
}: {
  label: string;
  value: number;
  growth?: number | null;
  invertGrowth?: boolean;
  sub: ReactNode;
  spark?: number[];
  color: string;
  /** Left out when the user can't open the page behind the figure */
  href?: string;
  periodWord: string;
  /** A plain number, not rupees */
  count?: boolean;
}) {
  const cls = "flex flex-col gap-1 rounded-[10px] border border-line bg-surface px-4 pb-3 pt-3.5 shadow-[0_1px_2px_rgba(20,40,25,.06),0_4px_14px_rgba(20,40,25,.05)]";
  const body = (
    <>
      <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-muted">
        {label}
        <Trend value={growth ?? null} invert={invertGrowth} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="num font-display text-[26px] font-bold tracking-tight text-ink">{count ? value.toLocaleString("en-IN") : inrCompact(value)}</div>
        {spark && <Sparkline values={spark} color={color} label={`${label} Trend Over the Last ${periodWord}`} />}
      </div>
      <div className="text-xs text-muted">{sub}</div>
    </>
  );
  return href ? (
    <Link href={href} className={cx(cls, "transition-colors hover:border-brand-500")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const ALERT_TONE = {
  bad: "border-l-rust-600 [&_b]:text-rust-600",
  warn: "border-l-ochre-600 [&_b]:text-ochre-600",
  info: "border-l-sea-700 [&_b]:text-sea-700",
  ok: "border-l-leaf-600 [&_b]:text-leaf-600",
};

function AlertTile({ n, label, tone, href }: { n: number; label: string; tone: keyof typeof ALERT_TONE; href: string }) {
  const calm = n === 0;
  return (
    <Link
      href={href}
      className={cx(
        "flex w-40 shrink-0 snap-start flex-col gap-0.5 rounded-[10px] border border-transparent border-l-4 bg-surface px-3.5 py-3 transition-colors hover:border-line sm:w-48",
        calm ? "border-l-line [&_b]:text-slate-400" : ALERT_TONE[tone],
      )}
    >
      <b className="num font-display text-[22px] leading-tight">{n}</b>
      <span className="text-[12.3px] leading-snug text-muted">{label}</span>
    </Link>
  );
}

function ExpiryBadge({ d }: { d: string }) {
  const left = daysUntil(d) ?? 0;
  const tone = left <= 7 ? "bg-rust-100 text-rust-600" : left <= 30 ? "bg-ochre-100 text-ochre-600" : "bg-sea-100 text-sea-700";
  return <span className={cx("num rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{left === 0 ? "today" : `${left} days`}</span>;
}

function pctOf(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

function CodeBadge({ code, title }: { code: string; title?: string }) {
  return (
    <span title={title} className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted">
      {code}
    </span>
  );
}

/** One row per branch: sales share bar (single hue, relative to the top branch), margin, purchases, stock and dues */
function BranchPerformance({
  rows,
  periodLabel,
  finance,
  dues,
  locked,
  onPick,
}: {
  rows: BranchRow[];
  periodLabel: string;
  finance: boolean;
  /** Customer dues column (customers or reports permission) */
  dues: boolean;
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
      title="Branch Performance"
      sub={`${periodLabel} · ${rows.length} branches${locked ? "" : " · pick a branch to open its dashboard"}`}
      footer={finance ? { text: `Gross margin = sales − GST − cost, before returns. Stock value${dues ? " and dues are" : " is"} as of today.` } : undefined}
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
              {dues && <th className={cx(th, "text-right")}>Customer dues</th>}
              {!locked && (
                <th className={th}>
                  <span className="sr-only">Open</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id} onClick={locked ? undefined : () => onPick(b.id)} className={cx("hover:bg-paper-2", !locked && "cursor-pointer")}>
                <td className={td}>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-semibold text-ink">{b.name}</span>
                    <CodeBadge code={b.code} />
                  </span>
                </td>
                <td className={cx(td, "min-w-[220px]")}>
                  <span
                    className="grid grid-cols-[1fr_auto] items-center gap-2.5"
                    title={`${b.name}: ${inr0(b.sales)} · ${pctOf(b.sales, total.sales)} of all sales`}
                  >
                    <span className="h-2 rounded-full bg-paper-3">
                      <span className="block h-2 rounded-full" style={{ width: `${(b.sales / top) * 100}%`, background: GREEN }} />
                    </span>
                    <span className="text-right">
                      <span className="num block font-semibold text-ink">{inrCompact(b.sales)}</span>
                      <span className="num block text-[11px] text-muted">{pctOf(b.sales, total.sales)} share</span>
                    </span>
                  </span>
                </td>
                <td className={cx(td, "num text-right")}>{b.invoices.toLocaleString("en-IN")}</td>
                {finance && (
                  <td className={cx(td, "text-right")}>
                    <span className="num block font-semibold text-ink">{inrCompact(b.margin)}</span>
                    <span className="num block text-[11px] text-muted">{pctOf(b.margin, b.sales)} of sales</span>
                  </td>
                )}
                {finance && <td className={cx(td, "num text-right")}>{inrCompact(b.purchases)}</td>}
                {finance && <td className={cx(td, "num text-right")}>{inrCompact(b.stockValue)}</td>}
                {dues && <td className={cx(td, "num text-right", b.dues > 0 ? "font-semibold text-rust-600" : "text-muted")}>{inrCompact(b.dues)}</td>}
                {!locked && (
                  <td className={cx(td, "text-right")}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(b.id);
                      }}
                      aria-label={`View ${b.name} dashboard`}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500"
                    >
                      View
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-paper-2 font-semibold text-ink">
              <td className={td}>All branches</td>
              <td className={cx(td, "num text-right")}>{inrCompact(total.sales)}</td>
              <td className={cx(td, "num text-right")}>{total.invoices.toLocaleString("en-IN")}</td>
              {finance && (
                <td className={cx(td, "text-right")}>
                  <span className="num block">{inrCompact(total.margin)}</span>
                  <span className="num block text-[11px] font-normal text-muted">{pctOf(total.margin, total.sales)} of sales</span>
                </td>
              )}
              {finance && <td className={cx(td, "num text-right")}>{inrCompact(total.purchases)}</td>}
              {finance && <td className={cx(td, "num text-right")}>{inrCompact(total.stockValue)}</td>}
              {dues && <td className={cx(td, "num text-right", total.dues > 0 && "text-rust-600")}>{inrCompact(total.dues)}</td>}
              {!locked && <td className={td} />}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

const th = "px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted bg-paper-2 border-b border-line";
const td = "px-4 py-2.5 border-b border-paper-3 text-[13px]";

// ───────────────────────── Page ─────────────────────────

export default function DashboardPage() {
  const { can } = useAuth();
  const { current, locked, setBranch } = useBranch();
  const [period, setPeriod] = useState<Period>("month");
  const [expTab, setExpTab] = useState<7 | 30 | 60>(30);
  const { data, error, loading, reload } = useApi<Dashboard>("/dashboard", { period });

  if (loading && !data) return <Spinner page />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const k = data.kpis;
  const finance = can("reports.view");
  // What each part of the page needs (the API leaves out the rest)
  const seeSales = can("sales.view", "reports.view");
  const seeDues = can("customers.view", "reports.view");
  const seeStock = can("inventory.view");
  const seePurchasing = can("purchases.view");
  /** The link when the user may open that page, otherwise nothing (shown as plain text) */
  const linkIf = (href: string) => (canOpenPath(href, can) ? href : undefined);
  const productLink = (id: string) => linkIf(`/products/${id}`);
  const kpiCount = [k.sales, k.collected, k.receivables, finance ? k.purchases : data.counts.customers].filter((x) => x != null).length;
  const a = data.alerts;
  const alertTiles = (
    [
      [a.approvalRequests, "Approval Requests Waiting", "warn", "/approvals"],
      [a.cashGaps, "Cash Gaps Not Explained", "bad", "/shifts"],
      [a.govtMismatches, "Govt Fertiliser Mismatches", "bad", "/inventory/govt-match"],
      [a.expiring7, "Batches Expire in 7 Days", "bad", "/inventory"],
      [a.expired, "Expired Batches in Stock", "bad", "/inventory"],
      [a.approvals, "POs Awaiting Approval", "warn", "/purchase-orders/approvals"],
      [a.inwardDue, "POs Waiting for Goods Inward", "warn", "/goods-inward"],
      [a.lowStock, "Items Below Reorder Level", "info", "/inventory?tab=low"],
      [a.grnsToInvoice, "GRNs Waiting for Invoice", "info", "/goods-inward"],
      [a.openVans, "Vans on the Road", "info", "/van"],
    ] as const
  )
    .filter(([n, , , href]) => n != null && canOpenPath(href, can))
    .map(([n, label, tone, href]) => ({ n: n ?? 0, label, tone, href }));
  const countTiles = (
    [
      ["/customers", <Users key="i" />, data.counts.customers, "Farmers & dealers"],
      ["/vendors", <Truck key="i" />, data.counts.vendors, "Vendors"],
      ["/products", <Leaf key="i" />, data.counts.products, "Active products"],
      ["/inventory", <Layers key="i" />, data.counts.batches, "Batches in stock"],
      ["/purchase-orders", <Boxes key="i" />, data.counts.openPos, "Open purchase orders"],
      ["/admin/users", <UserCog key="i" />, data.counts.users, "Active users"],
    ] as const
  )
    .filter(([href, , value]) => value != null && canOpenPath(href, can))
    .map(([href, icon, value, label]) => [href, icon, value ?? 0, label] as const);
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
        <div className="min-w-0">
          <p className="text-[16x] font-bold text-muted">Dashboard</p>
          <h1 className="break-words text-[22px] font-bold tracking-tight text-ink sm:text-[26px]">
            {greeting()}, {data.greetingName}
          </h1>
          <p className="text-[13px] text-muted">
            {scopeName} · {data.periodLabel} · {season()}
          </p>
        </div>
        <div role="tablist" aria-label="Period" className="inline-flex overflow-hidden rounded-[9px] border border-line bg-surface">
          {(
            [
              ["today", "Today"],
              ["month", "This Month"],
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
                period === v ? "bg-leaf-100 text-leaf-600" : "text-muted hover:bg-paper-2",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {kpiCount > 0 && (
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {k.sales && (
          <Kpi
            label="Sales"
            value={k.sales.value}
            growth={k.sales.growth}
            spark={sparkOf("sales")}
            color={GREEN}
            href={linkIf("/sales") ?? linkIf("/reports?tab=sales")}
            periodWord={periodWord}
            sub={
              finance && k.sales.grossProfit !== null
                ? `${k.sales.invoices} invoices · gross profit ${inrCompact(k.sales.grossProfit)}`
                : `${k.sales.invoices} invoices`
            }
          />
        )}
        {k.collected && (
          <Kpi
            label="Collected"
            value={k.collected.value}
            growth={k.collected.growth}
            spark={sparkOf("collected")}
            color={GREEN}
            href={linkIf("/payments")}
            periodWord={periodWord}
            sub={k.collected.pctOfSales === null ? "Payments received" : `${k.collected.pctOfSales}% of billed value`}
          />
        )}
        {k.receivables && (
          <Kpi
            label="Receivables"
            value={k.receivables.value}
            color="var(--color-ochre-600)"
            href={finance ? "/reports?tab=outstanding" : linkIf("/customers")}
            periodWord={periodWord}
            sub={
              scopedToBranch
                ? `Unpaid bills in this branch · ${k.receivables.customers} customers · over 30 days: ${inrCompact(k.receivables.over30)}`
                : `${k.receivables.customers} customers · over 30 days: ${inrCompact(k.receivables.over30)}`
            }
          />
        )}
        {finance && k.purchases ? (
          <Kpi
            label="Purchase"
            value={k.purchases.value}
            growth={k.purchases.growth}
            spark={sparkOf("purchases")}
            color={GOLD}
            href={linkIf("/purchases")}
            periodWord={periodWord}
            sub={
              scopedToBranch
                ? `Unpaid bills in this branch ${inrCompact(k.purchases.payables)} · due in 7 days: ${inrCompact(k.purchases.payablesDueSoon)}`
                : `Payables ${inrCompact(k.purchases.payables)} · due in 7 days: ${inrCompact(k.purchases.payablesDueSoon)}`
            }
          />
        ) : (
          data.counts.customers !== null && (
            <Kpi label="Customers" value={data.counts.customers} count color={GREEN} href={linkIf("/customers")} periodWord={periodWord} sub="Active farmers & dealers" />
          )
        )}
      </section>
      )}

      {/* Needs attention */}
      {alertTiles.length > 0 && (
        <section aria-label="Needs attention" className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2.5">
          {alertTiles.map((t) => (
            <AlertTile key={t.label} n={t.n} label={t.label} tone={t.tone} href={t.href} />
          ))}
        </section>
      )}

      {finance && data.cash && (data.cash.toDeposit > 0 || data.cash.openShifts > 0 || data.cash.unexplained > 0) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CashReconciliationCard cash={data.cash} />
        </section>
      )}

      {/* Branch comparison (All branches view only) */}
      {seeSales && branchRows.length > 1 && (
        <BranchPerformance
          rows={branchRows}
          periodLabel={data.periodLabel}
          finance={finance}
          dues={seeDues}
          locked={locked}
          onPick={(id) => {
            if (!locked) setBranch(id);
          }}
        />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Sales vs purchase */}
        {seeSales && (
        <Panel
          title={finance ? "Sales vs Purchase" : "Sales"}
          sub="Last 12 months"
          className="lg:col-span-8"
          action={
            <div className="flex gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 rounded-sm" style={{ background: GREEN }} />
                Sales
              </span>
              {finance && (
                <span className="flex items-center gap-1.5">
                  <i className="size-2.5 rounded-sm" style={{ background: GOLD }} />
                  Purchase
                </span>
              )}
            </div>
          }
          bodyClassName="p-4"
        >
          <div className="h-64">
            <LazySalesPurchaseChart data={trend} showPurchases={finance} />
          </div>
        </Panel>
        )}

        {/* Sales by category */}
        {seeSales && (
        <Panel title="Sales by Category" sub={data.periodLabel} className="lg:col-span-4" bodyClassName="p-4">
          {data.byCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sales in this period</p>
          ) : (
            <ul className="space-y-3">
              {data.byCategory.map((c) => (
                <li key={c.category} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2.5 text-[13px]">
                  <span className="truncate text-ink">{c.category}</span>
                  <span className="h-2 rounded-full bg-paper-3">
                    <span className="block h-2 rounded-full" style={{ width: `${(c.amount / catMax) * 100}%`, background: GREEN }} />
                  </span>
                  <span className="num text-right font-semibold text-ink">{inrCompact(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        )}

        {/* Where sales were made and how they were paid */}
        {seeSales && data.split && <SplitPanel split={data.split} label={data.periodLabel} />}

        {/* Expiry watch */}
        {seeStock && (
        <Panel
          title="Expiry Watch"
          sub="Batches in stock, earliest expiry first"
          className={seePurchasing ? "lg:col-span-7" : "lg:col-span-12"}
          action={
            <div className="flex gap-1 rounded-lg bg-paper p-0.5">
              {([7, 30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setExpTab(d)}
                  className={cx(
                    "rounded-md px-2.5 py-1 text-xs font-semibold",
                    expTab === d ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {d} days
                </button>
              ))}
            </div>
          }
          footer={{ text: `Alert window set in Store Settings`, href: "/inventory", link: "Open Stock & Batches" }}
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
                    <tr key={b.id} className="hover:bg-paper-2">
                      <td className={td}>
                        <MaybeLink href={productLink(b.product.id)}>{b.product.name}</MaybeLink>
                        <p className="text-xs text-muted">
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
        )}

        {/* PO approvals */}
        {seePurchasing && (
        <Panel
          title="PO Approvals"
          sub="Waiting on approvers"
          className={seeStock ? "lg:col-span-5" : "lg:col-span-12"}
          action={
            (data.alerts.approvals ?? 0) > 0 ? (
              <span className="rounded-full bg-ochre-100 px-2.5 py-0.5 text-xs font-semibold text-ochre-600">{data.alerts.approvals} pending</span>
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
                    <tr key={p.id} className="hover:bg-paper-2">
                      <td className={td}>
                        <Link href={`/purchase-orders/${p.id}`} className="font-semibold text-ink hover:text-brand-700">
                          {p.poNo}
                        </Link>
                        <p className="text-xs text-muted">
                          {p.vendor}
                          {p.round > 1 && <span className="font-semibold text-rust-600"> · Re-approval · round {p.round}</span>}
                        </p>
                      </td>
                      <td className={cx(td, "num text-right")}>{inr0(p.totalAmount)}</td>
                      <td className={td}>
                        <span className="whitespace-nowrap rounded-full bg-paper-3 px-2 py-0.5 text-xs font-medium text-ink">
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
        )}

        {/* Goods received: POs received in part or in full */}
        {seePurchasing && <GrnProgressPanel />}

        {/* Recent sales */}
        {seeSales && (
        <Panel
          title="Recent Sales"
          sub="Latest invoices and POS bills"
          className={finance ? "lg:col-span-8" : "lg:col-span-12"}
          action={
            canOpenPath("/sales", can) ? (
              <Link href="/sales" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500">
                View All
              </Link>
            ) : undefined
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
                    <tr key={s.id} className="hover:bg-paper-2">
                      <td className={td}>
                        <MaybeLink href={linkIf(`/sales/${s.id}`)}>{s.invoiceNo}</MaybeLink>
                        <p className="text-xs text-muted">
                          {date(s.saleDate)} · {s._count.items} item{s._count.items === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className={td}>
                        <p className="font-medium text-ink">{s.customerName || "Walk-in"}</p>
                        {s.customer?.village && <p className="text-xs text-muted">{s.customer.village}</p>}
                      </td>
                      <td className={td}>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={s.paymentStatus} />
                          <span className="text-xs text-muted">{modeLabel(s.paymentMode)}</span>
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
        )}

        {/* GST */}
        {finance && data.gst && (
          <Panel
            title="GST This Period"
            sub={`${data.periodLabel} · provisional`}
            className="lg:col-span-4"
            footer={{ text: "From invoices booked in the ERP", href: "/reports?tab=gst", link: "GST Summary" }}
            bodyClassName="p-4"
          >
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-paper-2 p-3 text-center">
              <div>
                <p className="text-[11px] text-muted">Output GST</p>
                <p className="num font-display text-sm font-bold sm:text-base">{inr0(data.gst.output)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Input credit</p>
                <p className="num font-display text-sm font-bold sm:text-base">{inr0(data.gst.input)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">{data.gst.net >= 0 ? "Net payable" : "Credit carried"}</p>
                <p className={cx("num font-display text-sm font-bold sm:text-base", data.gst.net >= 0 ? "text-ochre-600" : "text-leaf-600")}>
                  {inr0(Math.abs(data.gst.net))}
                </p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-paper-3 text-[13px]">
              {[
                ["GSTR-1 (Outward Supplies)", data.gst.gstr1Due],
                ["GSTR-3B (Summary Return)", data.gst.gstr3bDue],
              ].map(([l, d]) => {
                const left = daysUntil(d) ?? 0;
                return (
                  <li key={l} className="flex items-center justify-between py-2">
                    <span className="text-ink">{l}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        left <= 3 ? "bg-rust-100 text-rust-600" : left <= 10 ? "bg-ochre-100 text-ochre-600" : "bg-sea-100 text-sea-700",
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
        {seeSales && (
        <Panel title="Top Moving Products" sub={`${data.periodLabel} · quantity sold`} className={seeDues ? "lg:col-span-6" : "lg:col-span-12"}>
          <table className="w-full">
            <tbody>
              {data.topProducts.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-400">No sales in this period</td>
                </tr>
              ) : (
                data.topProducts.map((t, i) => (
                  <tr key={t.productId} className="hover:bg-paper-2">
                    <td className={cx(td, "num w-8 text-muted")}>{i + 1}</td>
                    <td className={td}>
                      <MaybeLink href={productLink(t.productId)}>{t.name}</MaybeLink>
                      <p className="text-xs text-muted">
                        {t.packSize ? `${t.packSize} · ` : ""}
                        {inr0(t.amount)}
                      </p>
                    </td>
                    <td className={cx(td, "num text-right")}>
                      <b>{qty(t.quantity)}</b> <span className="text-xs text-muted">{t.unit}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
        )}

        {/* Customer dues */}
        {seeDues && k.receivables && (
        <Panel
          title="Dues to Collect"
          sub="Customers with the highest balance"
          className={seeSales ? "lg:col-span-6" : "lg:col-span-12"}
          footer={{
            text: `${k.receivables.customers} customers owe ${inr0(k.receivables.value)}`,
            href: finance ? "/reports?tab=outstanding" : linkIf("/customers"),
            link: finance ? "Outstanding Report" : "All Customers",
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
                    <tr key={c.id} className="hover:bg-paper-2">
                      <td className={td}>
                        <MaybeLink href={linkIf(`/customers/${c.id}`)}>{c.name}</MaybeLink>
                        <p className="text-xs text-muted">{[c.village, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                      </td>
                      <td className={cx(td, "text-right")}>
                        <p className="num font-semibold text-rust-600">{inr0(c.balance)}</p>
                        {over && <p className="text-[11px] text-rust-600">over credit limit</p>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Panel>
        )}
      </section>

      {/* Counts: only those the user may open */}
      {countTiles.length > 0 && (
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {countTiles.map(([href, icon, value, label]) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3 transition-colors hover:border-brand-500"
          >
            <span className="shrink-0 rounded-lg bg-leaf-100 p-2 text-leaf-600 [&>svg]:size-4">{icon}</span>
            <span className="min-w-0">
              <b className="num block font-display text-lg leading-tight text-ink">{value.toLocaleString("en-IN")}</b>
              <span className="text-xs text-muted">{label}</span>
            </span>
          </Link>
        ))}
      </section>
      )}
    </div>
  );
}

/** A name that links to its page only when the user may open it */
/** One PO's receipt progress (from /grns/progress) */
interface ReceiptRow {
  id: string;
  poNo: string;
  status: string;
  orderDate: string;
  vendor: { id: string; name: string };
  branch: { code: string; name: string } | null;
  /** Set when every line uses the same unit; otherwise the totals mix units */
  unit: string | null;
  lines: number;
  linesComplete: number;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  shortfallQty: number;
  receivedPct: number;
  grnCount: number;
  lastGrn: { id: string; grnNo: string; receivedAt: string } | null;
}

/** Partly and fully received purchase orders, in a table with a tab for each */
function GrnProgressPanel() {
  const { currentId } = useBranch();
  const showBranch = currentId === "all";
  const [tab, setTab] = useState<"partial" | "full">("partial");
  const { data, error, loading, reload } = useApi<{ partial: ReceiptRow[]; full: ReceiptRow[]; counts: { partial: number; full: number } }>(
    "/grns/progress",
    { limit: 10 },
  );
  const rows = data?.[tab] ?? [];
  const q = (x: number, r: ReceiptRow) => `${qty(x)}${r.unit ? ` ${r.unit}` : ""}`;
  const tabs = [
    { key: "partial" as const, label: "Partially Received", n: data?.counts.partial ?? 0, on: "bg-ochre-100 text-ochre-600" },
    { key: "full" as const, label: "Fully Received", n: data?.counts.full ?? 0, on: "bg-brand-50 text-brand-700" },
  ];

  return (
    <Panel
      title="Goods Received (GRN)"
      sub="Purchase orders received in part or in full"
      className="lg:col-span-12"
      action={
        <div className="flex gap-1 rounded-lg bg-paper-2 p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                tab === t.key ? cx("shadow-sm", t.on) : "text-muted hover:text-ink",
              )}
            >
              {t.label} <span className="num">({t.n})</span>
            </button>
          ))}
        </div>
      }
      footer={{
        text: tab === "partial" ? "Balance quantities stay open on the PO for a later delivery" : "Every line received; book the purchase invoice if not done",
        href: "/goods-inward",
        link: "Goods Inward",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>PO / vendor</th>
              <th className={th}>Last GRN</th>
              <th className={cx(th, "text-right")}>Ordered</th>
              <th className={cx(th, "text-right")}>Received</th>
              <th className={cx(th, "text-right")}>Accepted (QC)</th>
              <th className={cx(th, "text-right")}>Shortfall</th>
              <th className={th}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {error && !data ? (
              <tr>
                <td colSpan={7} className="p-4">
                  <ErrorBox message={error} onRetry={reload} />
                </td>
              </tr>
            ) : loading && !data ? (
              <tr>
                <td colSpan={7} className="py-8">
                  <Spinner />
                </td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  {tab === "partial" ? "No purchase order is partly received" : "No purchase order is fully received yet"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-paper-2">
                  <td className={td}>
                    <Link href={`/purchase-orders/${r.id}`} className="font-semibold text-ink hover:text-brand-700">
                      {r.poNo}
                    </Link>
                    <p className="text-xs text-muted">
                      {r.vendor.name}
                      {showBranch && r.branch && <span> · {r.branch.code}</span>}
                    </p>
                  </td>
                  <td className={td}>
                    {r.lastGrn ? (
                      <>
                        <Link href={`/goods-inward/${r.lastGrn.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.lastGrn.grnNo}
                        </Link>
                        <p className="text-xs text-muted">
                          {date(r.lastGrn.receivedAt)}
                          {r.grnCount > 1 && ` · ${r.grnCount} GRNs`}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={cx(td, "num whitespace-nowrap text-right")}>{q(r.orderedQty, r)}</td>
                  <td className={cx(td, "num whitespace-nowrap text-right")}>{q(r.receivedQty, r)}</td>
                  <td className={cx(td, "num whitespace-nowrap text-right font-medium text-brand-700")}>{q(r.acceptedQty, r)}</td>
                  <td className={cx(td, "num whitespace-nowrap text-right", r.shortfallQty > 0 ? "font-semibold text-ochre-600" : "text-muted")}>
                    {r.shortfallQty > 0 ? q(r.shortfallQty, r) : "—"}
                  </td>
                  <td className={cx(td, "min-w-36")}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-3">
                        <div className={cx("h-full rounded-full", r.receivedPct >= 100 ? "bg-brand-600" : "bg-ochre-600")} style={{ width: `${r.receivedPct}%` }} />
                      </div>
                      <span className="num w-9 text-right text-xs font-semibold text-ink">{r.receivedPct}%</span>
                    </div>
                    <p className="text-[11px] text-muted">
                      {r.linesComplete} of {r.lines} line{r.lines === 1 ? "" : "s"} complete
                    </p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MaybeLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <span className="font-semibold text-ink">{children}</span>;
  return (
    <Link href={href} className="font-semibold text-ink hover:text-brand-700">
      {children}
    </Link>
  );
}

const CHANNEL_LABEL = { COUNTER: "Counter", VAN: "Van Trips" } as const;
const MODE_COLORS = ["#2f7d3a", "#c9932a", "#3b82c4", "#8b5cf6", "#0d9488", "#e07a5f", "#94a3b8", "#64748b"];

/** Sales by channel (counter / van) and money in by payment mode, with what went on credit */
function SplitPanel({ split, label }: { split: NonNullable<Dashboard["split"]>; label: string }) {
  const totalSales = split.channels.reduce((s, c) => s + c.total, 0);
  const modes = [...split.modes.filter((m) => m.amount > 0), ...(split.credit > 0 ? [{ mode: "CREDIT" as PaymentMode, amount: split.credit }] : [])];
  const totalModes = modes.reduce((s, m) => s + m.amount, 0);
  return (
    <Panel title="Sales by Channel & Payment Mode" sub={label} className="lg:col-span-12" bodyClassName="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Channel</p>
        {totalSales === 0 ? (
          <p className="py-4 text-sm text-slate-400">No sales in this period</p>
        ) : (
          <ul className="space-y-2.5">
            {split.channels.map((c) => (
              <li key={c.channel} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2.5 text-[13px] sm:grid-cols-[6rem_1fr_auto]">
                <span className="text-ink">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                <span className="h-2 rounded-full bg-paper-3">
                  <span className="block h-2 rounded-full" style={{ width: `${(c.total / totalSales) * 100}%`, background: c.channel === "VAN" ? "#3b82c4" : GREEN }} />
                </span>
                <span className="num text-right">
                  <b className="text-ink">{inrCompact(c.total)}</b>
                  <span className="block text-xs text-muted sm:ml-1 sm:inline">
                    {Math.round((c.total / totalSales) * 100)}% · {c.bills} bill{c.bills === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Payment Mode</p>
        {totalModes === 0 ? (
          <p className="py-4 text-sm text-slate-400">No money in yet</p>
        ) : (
          <>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-paper-3">
              {modes.map((m, i) => (
                <span key={m.mode} title={`${modeLabel(m.mode)} ${inrCompact(m.amount)}`} style={{ width: `${(m.amount / totalModes) * 100}%`, background: m.mode === "CREDIT" ? "#d97706" : MODE_COLORS[i % MODE_COLORS.length] }} />
              ))}
            </div>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-2">
              {modes.map((m, i) => (
                <li key={m.mode} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2.5 rounded-sm" style={{ background: m.mode === "CREDIT" ? "#d97706" : MODE_COLORS[i % MODE_COLORS.length] }} />
                    {m.mode === "CREDIT" ? "On credit (unpaid)" : modeLabel(m.mode)}
                  </span>
                  <span className="num font-semibold text-ink">{inrCompact(m.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
