"use client";

import type { ReactNode } from "react";
import { Card, EmptyRow, Table, Td, Th, cx } from "@/components/ui";
import { downloadCsv, inr, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { ReportFrame, TotalRow, periodLabel, type Range } from "./ReportKit";

// ───────────────────────── Profit & Loss ─────────────────────────

interface ProfitLoss {
  invoices: number;
  grossSales: number;
  discounts: number;
  outputTax: number;
  returns: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
}

function Line({
  label,
  amount,
  sub,
  indent,
  negative,
  strong,
  muted,
}: {
  label: ReactNode;
  amount: number;
  sub?: ReactNode;
  indent?: boolean;
  negative?: boolean;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 text-sm", indent && "pl-5", muted && "text-slate-500")}>
      <span className={cx(strong ? "font-semibold text-slate-900" : "text-slate-700", muted && "text-slate-500")}>
        {label}
        {sub && <span className="ml-2 text-xs font-normal text-slate-400">{sub}</span>}
      </span>
      <span className={cx("num whitespace-nowrap", strong ? "font-semibold text-slate-900" : "text-slate-700", muted && "text-slate-500")}>
        {negative && amount !== 0 ? `(${inr(amount)})` : inr(amount)}
      </span>
    </div>
  );
}

function Subtotal({ label, amount, sub, tone }: { label: string; amount: number; sub?: ReactNode; tone?: "profit" }) {
  return (
    <div
      className={cx(
        "my-1 flex items-baseline justify-between gap-4 border-t border-slate-300 py-2 text-sm font-semibold",
        tone === "profit" && "border-b-4 border-double border-b-slate-300",
      )}
    >
      <span className="text-slate-900">
        {label}
        {sub && <span className="ml-2 text-xs font-normal text-slate-500">{sub}</span>}
      </span>
      <span className={cx("num", tone === "profit" ? (amount < 0 ? "text-red-600" : "text-brand-700") : "text-slate-900", tone === "profit" && "text-base")}>
        {amount < 0 ? `(${inr(-amount)})` : inr(amount)}
      </span>
    </div>
  );
}

export function ProfitLossReport({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<ProfitLoss>("/reports/profit-loss", { ...range });

  // The API nets GST out of returns; recover the ex-GST returns figure so the statement adds up
  const returnsNet = data ? round2(data.grossSales - data.outputTax - data.netRevenue) : 0;
  const netMargin = data && data.netRevenue > 0 ? round2((data.netProfit / data.netRevenue) * 100) : 0;

  function csv() {
    if (!data) return;
    downloadCsv(`profit-loss-${range.from}-to-${range.to}.csv`, ["Line", "Amount"], [
      ["Gross Sales (Incl. GST)", data.grossSales],
      ["Less: GST Collected", -data.outputTax],
      ["Less: Sales Returns (Excl. GST)", -returnsNet],
      ["Net Revenue", data.netRevenue],
      ["Less: Cost of Goods Sold", -data.cogs],
      ["Gross Profit", data.grossProfit],
      ["Gross Margin %", data.grossMarginPct],
      ...data.expenses.map((e) => [`Expense: ${e.category}`, -e.amount] as [string, number]),
      ["Total Expenses", -data.totalExpenses],
      ["Net Profit", data.netProfit],
      ["Discounts Given (Memo)", data.discounts],
    ]);
  }

  return (
    <ReportFrame
      title="Profit & Loss Statement"
      period={periodLabel(range)}
      controls={rangeBar}
      onCsv={csv}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" bodyClassName="px-4 py-5 sm:px-6">
            <div className="mb-3 flex items-baseline justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Profit & Loss</h3>
              <span className="text-xs text-slate-500">{periodLabel(range)}</span>
            </div>

            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Revenue</p>
            <Line label="Gross Sales" sub={`${data.invoices} invoices, incl. GST`} amount={data.grossSales} />
            <Line label="Less: GST Collected" amount={data.outputTax} negative indent />
            <Line label="Less: Sales Returns" sub="excl. GST" amount={returnsNet} negative indent />
            <Subtotal label="Net Revenue" amount={data.netRevenue} />

            <Line label="Less: Cost of Goods Sold" amount={data.cogs} negative />
            <Subtotal label="Gross Profit" sub={`${data.grossMarginPct}% margin`} amount={data.grossProfit} />

            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Operating Expenses</p>
            {data.expenses.length === 0 ? (
              <p className="py-1.5 pl-5 text-sm text-slate-400">No expenses recorded</p>
            ) : (
              data.expenses.map((e) => <Line key={e.category} label={e.category} amount={e.amount} indent />)
            )}
            <Subtotal label="Total Expenses" amount={data.totalExpenses} />

            <div className="mt-3">
              <Subtotal label="Net Profit" sub={`${netMargin}% of net revenue`} amount={data.netProfit} tone="profit" />
            </div>

            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2">
              <Line label="Memo: Discounts Given on Invoices" sub="already deducted from gross sales" amount={data.discounts} muted />
              <Line label="Memo: Returns Refunded / Credited" sub="incl. GST" amount={data.returns} muted />
            </div>
          </Card>

          <div className="space-y-3">
            <Kpi label="Net Revenue" value={inr(data.netRevenue)} />
            <Kpi label="Gross Profit" value={inr(data.grossProfit)} sub={`${data.grossMarginPct}% gross margin`} />
            <Kpi label="Expenses" value={inr(data.totalExpenses)} sub={data.netRevenue > 0 ? `${round2((data.totalExpenses / data.netRevenue) * 100)}% of revenue` : undefined} />
            <Kpi label="Net Profit" value={inr(data.netProfit)} sub={`${netMargin}% net margin`} tone={data.netProfit < 0 ? "red" : "green"} />
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("num mt-1 text-xl font-semibold", tone === "red" ? "text-red-600" : tone === "green" ? "text-brand-700" : "text-slate-900")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ───────────────────────── GST summary ─────────────────────────

interface GstReport {
  output: { gstRate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number }[];
  input: { gstRate: number; taxable: number; tax: number }[];
  hsn: { hsnCode: string; unit: string; gstRate: number; quantity: number; taxable: number; tax: number; total: number }[];
  outputTax: number;
  /** Net of input tax reversed by posted debit/credit notes */
  inputTax: number;
  noteAdjustment?: { count: number; taxable: number; tax: number };
  netPayable: number;
}

const sum = <T,>(rows: T[], f: (r: T) => number) => round2(rows.reduce((s, r) => s + f(r), 0));

export function GstReportView({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<GstReport>("/reports/gst", { ...range });

  function csv() {
    if (!data) return;
    downloadCsv(
      `gst-summary-${range.from}-to-${range.to}.csv`,
      ["Section", "GST %", "HSN", "Unit", "Qty", "Taxable", "CGST", "SGST", "IGST", "Tax", "Total"],
      [
        ...data.output.map((r) => ["Output", r.gstRate, "", "", "", r.taxable, r.cgst, r.sgst, r.igst, r.tax, ""]),
        ...data.input.map((r) => ["Input", r.gstRate, "", "", "", r.taxable, "", "", "", r.tax, ""]),
        ...(data.noteAdjustment?.count
          ? [["Input reversed by debit/credit notes", "", "", "", data.noteAdjustment.count, -data.noteAdjustment.taxable, "", "", "", -data.noteAdjustment.tax, ""]]
          : []),
        ["Net Input Tax Credit", "", "", "", "", "", "", "", "", data.inputTax, ""],
        ...data.hsn.map((r) => ["HSN", r.gstRate, r.hsnCode, r.unit, r.quantity, r.taxable, "", "", "", r.tax, r.total]),
        ["Net GST Payable", "", "", "", "", "", "", "", "", data.netPayable, ""],
      ],
    );
  }

  return (
    <ReportFrame
      title="GST Summary"
      period={periodLabel(range)}
      controls={rangeBar}
      onCsv={csv}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Output Tax (On Sales)" value={inr(data.outputTax)} />
            <Kpi
              label="Input Tax Credit (On Purchases)"
              value={inr(data.inputTax)}
              sub={data.noteAdjustment?.count ? `Net of ${inr(data.noteAdjustment.tax)} reversed by debit/credit notes` : undefined}
            />
            <div
              className={cx(
                "rounded-xl border p-4 shadow-sm",
                data.netPayable > 0 ? "border-amber-200 bg-amber-50" : "border-brand-200 bg-brand-50",
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{data.netPayable >= 0 ? "Net GST payable" : "Excess ITC (carry forward)"}</p>
              <p className={cx("num mt-1 text-xl font-semibold", data.netPayable > 0 ? "text-amber-800" : "text-brand-700")}>
                {inr(Math.abs(data.netPayable))}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Output tax − input tax credit</p>
            </div>
          </div>

          <Card title="Output Tax by Rate (Sales)" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>GST Rate</Th>
                  <Th right>Taxable Value</Th>
                  <Th right>CGST</Th>
                  <Th right>SGST</Th>
                  <Th right>IGST</Th>
                  <Th right>Total Tax</Th>
                </tr>
              </thead>
              <tbody>
                {!data.output.length ? (
                  <EmptyRow colSpan={6}>No sales in this period</EmptyRow>
                ) : (
                  data.output.map((r) => (
                    <tr key={r.gstRate}>
                      <Td className="font-medium">{r.gstRate}%</Td>
                      <Td right>{inr(r.taxable)}</Td>
                      <Td right>{inr(r.cgst)}</Td>
                      <Td right>{inr(r.sgst)}</Td>
                      <Td right>{inr(r.igst)}</Td>
                      <Td right className="font-medium">
                        {inr(r.tax)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.output.length > 0 && (
                <tfoot>
                  <TotalRow>
                    <Td>Total</Td>
                    <Td right>{inr(sum(data.output, (r) => r.taxable))}</Td>
                    <Td right>{inr(sum(data.output, (r) => r.cgst))}</Td>
                    <Td right>{inr(sum(data.output, (r) => r.sgst))}</Td>
                    <Td right>{inr(sum(data.output, (r) => r.igst))}</Td>
                    <Td right>{inr(data.outputTax)}</Td>
                  </TotalRow>
                </tfoot>
              )}
            </Table>
          </Card>

          <Card title="Input Tax by Rate (Purchases)" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>GST Rate</Th>
                  <Th right>Taxable Value</Th>
                  <Th right>Input Tax</Th>
                </tr>
              </thead>
              <tbody>
                {!data.input.length ? (
                  <EmptyRow colSpan={3}>No purchases in this period</EmptyRow>
                ) : (
                  data.input.map((r) => (
                    <tr key={r.gstRate}>
                      <Td className="font-medium">{r.gstRate}%</Td>
                      <Td right>{inr(r.taxable)}</Td>
                      <Td right className="font-medium">
                        {inr(r.tax)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              {(data.input.length > 0 || !!data.noteAdjustment?.count) && (
                <tfoot>
                  {data.noteAdjustment && data.noteAdjustment.count > 0 && (
                    <>
                      <tr>
                        <Td className="text-slate-600">Total on purchase bills</Td>
                        <Td right>{inr(sum(data.input, (r) => r.taxable))}</Td>
                        <Td right>{inr(sum(data.input, (r) => r.tax))}</Td>
                      </tr>
                      <tr className="text-red-700">
                        <Td>
                          Less: reversed by {data.noteAdjustment.count} debit/credit note{data.noteAdjustment.count === 1 ? "" : "s"}{" "}
                          {inr(data.noteAdjustment.tax)}{" "}
                          <span className="text-xs text-slate-500">(input tax shown is net)</span>
                        </Td>
                        <Td right>− {inr(data.noteAdjustment.taxable)}</Td>
                        <Td right>− {inr(data.noteAdjustment.tax)}</Td>
                      </tr>
                    </>
                  )}
                  <TotalRow>
                    <Td>{data.noteAdjustment?.count ? "Net input tax credit" : "Total"}</Td>
                    <Td right>{inr(round2(sum(data.input, (r) => r.taxable) - (data.noteAdjustment?.taxable ?? 0)))}</Td>
                    <Td right>{inr(data.inputTax)}</Td>
                  </TotalRow>
                </tfoot>
              )}
            </Table>
          </Card>

          <Card title="HSN-wise Summary of Outward Supplies" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>HSN</Th>
                  <Th>Unit</Th>
                  <Th right>GST Rate</Th>
                  <Th right>Quantity</Th>
                  <Th right>Taxable Value</Th>
                  <Th right>Tax</Th>
                  <Th right>Total Value</Th>
                </tr>
              </thead>
              <tbody>
                {!data.hsn.length ? (
                  <EmptyRow colSpan={7}>No sales in this period</EmptyRow>
                ) : (
                  data.hsn.map((r) => (
                    <tr key={`${r.hsnCode}-${r.unit}-${r.gstRate}`}>
                      <Td className="font-medium">{r.hsnCode}</Td>
                      <Td>{r.unit}</Td>
                      <Td right>{r.gstRate}%</Td>
                      <Td right>{r.quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</Td>
                      <Td right>{inr(r.taxable)}</Td>
                      <Td right>{inr(r.tax)}</Td>
                      <Td right className="font-medium">
                        {inr(r.total)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.hsn.length > 0 && (
                <tfoot>
                  <TotalRow>
                    <Td colSpan={4}>Total</Td>
                    <Td right>{inr(sum(data.hsn, (r) => r.taxable))}</Td>
                    <Td right>{inr(sum(data.hsn, (r) => r.tax))}</Td>
                    <Td right>{inr(sum(data.hsn, (r) => r.total))}</Td>
                  </TotalRow>
                </tfoot>
              )}
            </Table>
          </Card>
        </div>
      )}
    </ReportFrame>
  );
}
