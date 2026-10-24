"use client";

import { ArrowDownRight, ArrowUpRight, CalendarDays, FileText, IndianRupee, Minus, Store } from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Card, EmptyRow, StatCard, Table, Td, Th } from "@/components/ui";
import { downloadCsv, inr, inr0, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { ReportFrame, ReportLink, SortTh, TotalRow, periodLabel, useSort, type Range } from "./ReportKit";

// The chart library loads on its own, after the report (see PurchaseCharts)
const chartLoading = () => <div className="h-full min-h-40 animate-pulse rounded-lg bg-slate-50" />;
const RankBarChart = dynamic(() => import("./PurchaseCharts").then((m) => m.RankBarChart), { ssr: false, loading: chartLoading });
const MonthColumnChart = dynamic(() => import("./PurchaseCharts").then((m) => m.MonthColumnChart), { ssr: false, loading: chartLoading });
const CompareLineChart = dynamic(() => import("./PurchaseCharts").then((m) => m.CompareLineChart), { ssr: false, loading: chartLoading });

/** PO = purchase orders (submitted onwards, incl. GST); GRN = goods received (passed qty x PO rate, excl. GST) */
export type PurchaseKind = "po" | "grn";

const KIND = {
  po: {
    title: "Purchase Orders",
    doc: "PO",
    docs: "POs",
    countLabel: "POs",
    valueLabel: "PO Value (Incl. GST)",
    note: "Purchase orders by order date, from submission on (drafts, rejected and cancelled POs left out). Value includes GST.",
  },
  grn: {
    title: "Goods Received",
    doc: "GRN",
    docs: "GRNs",
    countLabel: "GRNs",
    valueLabel: "Received Value (Excl. GST)",
    note: "Goods inward by received date. Value is the passed quantity at the PO rate after discount, before GST.",
  },
} as const;

interface AnalyticsRow {
  id: string;
  name: string;
  unit?: string;
  quantity: number;
  value: number;
  count: number;
}

interface PurchaseAnalytics {
  totals: { value: number; count: number; vendors: number; products: number };
  byProduct: AnalyticsRow[];
  byVendor: AnalyticsRow[];
}

const share = (v: number, total: number) => (total > 0 ? round2((v / total) * 100) : 0);
const TOP = 10;

// ───────────────────────── By product / by vendor ─────────────────────────

export function PurchaseByProductReport({ kind, range, rangeBar }: { kind: PurchaseKind; range: Range; rangeBar: ReactNode }) {
  return <PurchaseBreakdown kind={kind} by="product" range={range} rangeBar={rangeBar} />;
}

export function PurchaseByVendorReport({ kind, range, rangeBar }: { kind: PurchaseKind; range: Range; rangeBar: ReactNode }) {
  return <PurchaseBreakdown kind={kind} by="vendor" range={range} rangeBar={rangeBar} />;
}

function PurchaseBreakdown({ kind, by, range, rangeBar }: { kind: PurchaseKind; by: "product" | "vendor"; range: Range; rangeBar: ReactNode }) {
  const k = KIND[kind];
  const { data, error, loading, reload } = useApi<PurchaseAnalytics>("/reports/purchase-analytics", { kind, ...range });
  const rows = (by === "product" ? data?.byProduct : data?.byVendor) ?? [];
  const total = data?.totals.value ?? 0;
  const sort = useSort<AnalyticsRow, "name" | "quantity" | "count" | "value">(rows, "value");
  const title = `${k.title} by ${by === "product" ? "Product" : "Vendor"}`;
  // Vendors on a PO have no single unit, so their quantity is only shown for goods received
  const showQty = by === "product" || kind === "grn";

  function csv() {
    downloadCsv(
      `${kind}-by-${by}-${range.from}-to-${range.to}.csv`,
      [by === "product" ? "Product" : "Vendor", ...(showQty ? ["Quantity", ...(by === "product" ? ["Unit"] : [])] : []), k.countLabel, k.valueLabel, "Share %"],
      [
        ...sort.sorted.map((r) => [r.name, ...(showQty ? [r.quantity, ...(by === "product" ? [r.unit ?? ""] : [])] : []), r.count, r.value, share(r.value, total)]),
        ["TOTAL", ...(showQty ? ["", ...(by === "product" ? [""] : [])] : []), by === "vendor" ? (data?.totals.count ?? "") : "", total, 100],
      ],
    );
  }

  const cols = 4 + (showQty ? 1 : 0);
  return (
    <ReportFrame title={title} period={periodLabel(range)} controls={rangeBar} onCsv={csv} loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={`Total ${k.title}`} value={inr0(total)} sub={k.valueLabel} icon={<IndianRupee />} tone="amber" />
            <StatCard label={k.docs} value={data.totals.count} sub={`in ${periodLabel(range)}`} icon={<FileText />} />
            <StatCard
              label={by === "product" ? "Products" : "Vendors"}
              value={by === "product" ? data.totals.products : data.totals.vendors}
              sub={rows[0] ? `Top: ${rows[0].name} (${share(rows[0].value, total)}%)` : "None in this period"}
              icon={<Store />}
            />
          </div>

          <Card title={rows.length ? `Top ${Math.min(TOP, rows.length)} by Value` : "Top by Value"} className="mb-4">
            {rows.length ? (
              <RankBarChart
                data={rows.slice(0, TOP).map((r) => ({ name: r.name, value: r.value, count: r.count, quantity: showQty ? r.quantity : undefined, unit: r.unit }))}
                countLabel={k.countLabel}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">No {k.title.toLowerCase()} in this period</p>
            )}
          </Card>

          <Card bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">#</Th>
                  <SortTh label={by === "product" ? "Product" : "Vendor"} k="name" sort={sort} />
                  {showQty && <SortTh label="Quantity" k="quantity" sort={sort} right />}
                  <SortTh label={k.countLabel} k="count" sort={sort} right />
                  <SortTh label="Value" k="value" sort={sort} right />
                  <Th right>Share</Th>
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (
                  <EmptyRow colSpan={cols + 1}>No {k.title.toLowerCase()} in this period</EmptyRow>
                ) : (
                  sort.sorted.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="num text-slate-400">{i + 1}</Td>
                      <Td>
                        <ReportLink
                          href={by === "product" ? `/products/${r.id}` : `/vendors/${r.id}`}
                          perms={by === "product" ? ["products.view"] : ["vendors.view"]}
                          className="font-medium text-slate-900 hover:text-brand-700"
                        >
                          {r.name}
                        </ReportLink>
                      </Td>
                      {showQty && (
                        <Td right className="num whitespace-nowrap">
                          {qty(r.quantity)}
                          {r.unit && <span className="ml-1 text-xs text-slate-500">{r.unit}</span>}
                        </Td>
                      )}
                      <Td right className="num">
                        {r.count}
                      </Td>
                      <Td right className="num whitespace-nowrap font-medium text-slate-900">
                        {inr(r.value)}
                      </Td>
                      <Td right className="num whitespace-nowrap text-slate-600">
                        {share(r.value, total)}%
                      </Td>
                    </tr>
                  ))
                )}
                {rows.length > 0 && (
                  <TotalRow>
                    <Td />
                    <Td>Total</Td>
                    {showQty && <Td />}
                    <Td right className="num">
                      {by === "vendor" ? data.totals.count : ""}
                    </Td>
                    <Td right className="num whitespace-nowrap">
                      {inr(total)}
                    </Td>
                    <Td right className="num">
                      100%
                    </Td>
                  </TotalRow>
                )}
              </tbody>
            </Table>
          </Card>
          <p className="mt-2 text-xs text-slate-500">{k.note}</p>
        </>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── By month (this month vs last month) ─────────────────────────

interface PurchaseTrend {
  months: { month: string; value: number; count: number }[];
  current: { month: string; value: number; count: number };
  previous: { month: string; value: number; count: number; toDate: number };
  today: number;
  daily: { day: number; current: number | null; previous: number | null }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" → "Oct 2026" (short: "Oct", with the year on January and the first bar) */
const monthName = (ym: string, short = false, withYear = true) => {
  const m = MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
  return short && !withYear ? m : `${m} ${short ? ym.slice(2, 4) : ym.slice(0, 4)}`;
};

export function PurchaseByMonthReport({ kind }: { kind: PurchaseKind }) {
  const k = KIND[kind];
  const { data, error, loading, reload } = useApi<PurchaseTrend>("/reports/purchase-trend", { kind });
  const cur = data?.current;
  const prev = data?.previous;
  // Like for like: this month so far against last month up to the same day
  const change = cur && prev && prev.toDate > 0 ? round2(((cur.value - prev.toDate) / prev.toDate) * 100) : null;
  const curName = cur ? monthName(cur.month) : "This month";
  const prevName = prev ? monthName(prev.month) : "Last month";

  function csv() {
    if (!data) return;
    downloadCsv(
      `${kind}-by-month.csv`,
      ["Month", k.countLabel, k.valueLabel],
      data.months.map((m) => [monthName(m.month), m.count, m.value]),
    );
  }

  return (
    <ReportFrame title={`${k.title} by Month`} period="Last 12 months" onCsv={csv} loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && cur && prev && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={`${curName} (to day ${data.today})`} value={inr0(cur.value)} sub={`${cur.count} ${cur.count === 1 ? k.doc : k.docs}`} icon={<IndianRupee />} tone="amber" />
            <StatCard label={`${prevName} (to day ${data.today})`} value={inr0(prev.toDate)} sub="same days last month" icon={<CalendarDays />} tone="blue" />
            <StatCard
              label="Change vs Last Month"
              value={
                change === null ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {change > 0 ? <ArrowUpRight className="size-5" /> : change < 0 ? <ArrowDownRight className="size-5" /> : <Minus className="size-5" />}
                    {change > 0 ? "+" : ""}
                    {change}%
                  </span>
                )
              }
              sub={change === null ? `nothing in ${prevName} to compare with` : "this month so far vs the same days last month"}
            />
            <StatCard label={`${prevName} (Full Month)`} value={inr0(prev.value)} sub={`${prev.count} ${prev.count === 1 ? k.doc : k.docs}`} icon={<FileText />} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={`${curName} vs ${prevName} · Running Total`}>
              <div className="h-64">
                <CompareLineChart data={data.daily} currentLabel={curName} previousLabel={prevName} />
              </div>
            </Card>
            <Card title="Last 12 Months">
              <div className="h-64">
                <MonthColumnChart
                  data={data.months.map((m, i) => ({ label: monthName(m.month, true, i === 0 || m.month.endsWith("-01")), value: m.value, count: m.count }))}
                  countLabel={k.countLabel}
                />
              </div>
            </Card>
          </div>

          <Card bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th right>{k.countLabel}</Th>
                  <Th right>Value</Th>
                  <Th right>vs Month Before</Th>
                </tr>
              </thead>
              <tbody>
                {[...data.months].reverse().map((m, i, all) => {
                  const before = all[i + 1];
                  const pct = before && before.value > 0 ? round2(((m.value - before.value) / before.value) * 100) : null;
                  return (
                    <tr key={m.month} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-800">
                        {monthName(m.month)}
                        {m.month === cur.month && <span className="ml-1.5 text-xs font-normal text-slate-500">(so far)</span>}
                      </Td>
                      <Td right className="num">
                        {m.count}
                      </Td>
                      <Td right className="num whitespace-nowrap font-medium text-slate-900">
                        {inr(m.value)}
                      </Td>
                      <Td right className="num whitespace-nowrap text-slate-600">
                        {pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
                      </Td>
                    </tr>
                  );
                })}
                <TotalRow>
                  <Td>Last 12 months</Td>
                  <Td right className="num">
                    {data.months.reduce((t, m) => t + m.count, 0)}
                  </Td>
                  <Td right className="num whitespace-nowrap">
                    {inr(round2(data.months.reduce((t, m) => t + m.value, 0)))}
                  </Td>
                  <Td />
                </TotalRow>
              </tbody>
            </Table>
          </Card>
          <p className="mt-2 text-xs text-slate-500">{k.note}</p>
        </>
      )}
    </ReportFrame>
  );
}
