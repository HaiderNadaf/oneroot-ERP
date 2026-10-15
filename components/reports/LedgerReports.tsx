"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, Card, EmptyRow, Input, Select, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { date, dateTime, downloadCsv, inr, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PRODUCT_TYPES, TYPE_LABEL, type DocStatus, type PaymentMode } from "@/lib/types";
import { ReportFrame, TotalRow } from "./ReportKit";

const modeLabel = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();

// ───────────────────────── Stock valuation ─────────────────────────

interface StockRow {
  id: string;
  sku: string;
  name: string;
  type: string;
  category: string | null;
  unit: string;
  stock: number;
  reorderLevel: number;
  salePrice: number;
  costValue: number;
  saleValue: number;
}

export function StockValuationReport() {
  const [type, setType] = useState("");
  const { data, error, loading, reload } = useApi<{ items: StockRow[]; totals: { costValue: number; saleValue: number } }>("/reports/stock", { type });

  function csv() {
    if (!data) return;
    downloadCsv(
      `stock-valuation-${today()}.csv`,
      ["SKU", "Product", "Type", "Category", "Stock", "Unit", "Reorder level", "Sale price", "Value at cost", "Value at sale price"],
      [
        ...data.items.map((r) => [r.sku, r.name, r.type, r.category, r.stock, r.unit, r.reorderLevel, r.salePrice, r.costValue, r.saleValue]),
        ["", "TOTAL", "", "", "", "", "", "", data.totals.costValue, data.totals.saleValue],
      ],
    );
  }

  const potential = data ? round2(data.totals.saleValue - data.totals.costValue) : 0;

  return (
    <ReportFrame
      title={`Stock valuation${type ? ` · ${TYPE_LABEL[type as keyof typeof TYPE_LABEL]}` : ""}`}
      period={`as on ${date(new Date())}`}
      controls={
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
          <option value="">All product types</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      }
      onCsv={csv}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="Value at cost" value={inr(data.totals.costValue)} sub={`${data.items.filter((r) => r.stock > 0).length} products in stock`} />
            <Tile label="Value at selling price" value={inr(data.totals.saleValue)} sub="incl. GST" />
            <Tile label="Potential gross margin" value={inr(potential)} sub="selling value − cost (before GST)" />
          </div>
          <Card bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Type</Th>
                  <Th right>Stock</Th>
                  <Th right>Sale price</Th>
                  <Th right>Value at cost</Th>
                  <Th right>Value at sale price</Th>
                </tr>
              </thead>
              <tbody>
                {!data.items.length ? (
                  <EmptyRow colSpan={6}>No active products</EmptyRow>
                ) : (
                  data.items.map((r) => {
                    const low = r.reorderLevel > 0 && r.stock <= r.reorderLevel;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <Td>
                          <Link href={`/products/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                            {r.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {r.sku}
                            {r.category && ` · ${r.category}`}
                          </p>
                        </Td>
                        <Td>
                          <StatusBadge status={r.type} />
                        </Td>
                        <Td right className={r.stock <= 0 ? "text-slate-400" : low ? "font-medium text-red-600" : "font-medium"}>
                          {qty(r.stock)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                        </Td>
                        <Td right>{inr(r.salePrice)}</Td>
                        <Td right>{inr(r.costValue)}</Td>
                        <Td right>{inr(r.saleValue)}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {data.items.length > 0 && (
                <tfoot>
                  <TotalRow>
                    <Td colSpan={4}>Total · {data.items.length} products</Td>
                    <Td right>{inr(data.totals.costValue)}</Td>
                    <Td right>{inr(data.totals.saleValue)}</Td>
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

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("num mt-1 break-words text-lg font-semibold sm:text-xl", tone === "red" ? "text-red-600" : tone === "green" ? "text-brand-700" : "text-slate-900")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Outstanding ─────────────────────────

interface OutstandingRow {
  id: string;
  name: string;
  phone?: string | null;
  village?: string | null;
  creditLimit?: string | null;
  balance: number;
  aging: { d0_30: number; d31_60: number; d61_90: number; d90plus: number };
  oldestDue: string | null;
}

const BUCKETS = [
  { key: "d0_30", label: "0–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
] as const;

export function OutstandingReport() {
  const [party, setParty] = useState<"customer" | "vendor">("customer");
  const { data, error, loading, reload } = useApi<{ party: string; rows: OutstandingRow[]; total: number }>("/reports/outstanding", { party });
  const isVendor = party === "vendor";
  const rows = data?.party === party ? data.rows : [];
  const bucketTotals = BUCKETS.map((b) => round2(rows.reduce((s, r) => s + r.aging[b.key], 0)));

  function csv() {
    if (!data) return;
    downloadCsv(
      `${isVendor ? "payables" : "receivables"}-${today()}.csv`,
      ["Name", "Phone", ...BUCKETS.map((b) => b.label), "Balance", "Oldest unpaid bill"],
      [
        ...rows.map((r) => [r.name, r.phone, ...BUCKETS.map((b) => r.aging[b.key]), r.balance, r.oldestDue?.slice(0, 10)]),
        ["TOTAL", "", ...bucketTotals, data.total, ""],
      ],
    );
  }

  return (
    <ReportFrame
      title={isVendor ? "Outstanding payables (vendors)" : "Outstanding receivables (customers)"}
      period={`as on ${date(new Date())}`}
      controls={
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
          {(["customer", "vendor"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setParty(p)}
              className={cx("h-8 rounded-md px-3 text-sm font-medium", party === p ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {p === "customer" ? "Customers" : "Vendors"}
            </button>
          ))}
        </div>
      }
      onCsv={csv}
      loading={loading || data?.party !== party}
      error={error}
      onRetry={reload}
      hasData={!!data && data.party === party}
    >
      {data && data.party === party && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label={isVendor ? "Total payable" : "Total receivable"} value={inr(data.total)} sub={`${rows.length} ${isVendor ? "vendors" : "customers"}`} />
            {BUCKETS.map((b, i) => (
              <Tile key={b.key} label={b.label} value={inr(bucketTotals[i])} tone={b.key === "d90plus" && bucketTotals[i] > 0 ? "red" : undefined} />
            ))}
          </div>
          <Card bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>{isVendor ? "Vendor" : "Customer"}</Th>
                  <Th>Oldest unpaid</Th>
                  {BUCKETS.map((b) => (
                    <Th key={b.key} right className={b.key === "d90plus" ? "text-red-600" : undefined}>
                      {b.label}
                    </Th>
                  ))}
                  <Th right>Balance</Th>
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (
                  <EmptyRow colSpan={7}>{isVendor ? "Nothing payable — all vendors are settled" : "Nothing outstanding — all customers are settled"}</EmptyRow>
                ) : (
                  rows.map((r) => {
                    const overLimit = !isVendor && n(r.creditLimit) > 0 && r.balance > n(r.creditLimit);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <Td>
                          <Link href={`/${isVendor ? "vendors" : "customers"}/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                            {r.name}
                          </Link>
                          <p className="text-xs text-slate-500">{[r.phone, r.village].filter(Boolean).join(" · ") || "—"}</p>
                        </Td>
                        <Td className="whitespace-nowrap text-xs">{date(r.oldestDue)}</Td>
                        {BUCKETS.map((b) => (
                          <Td
                            key={b.key}
                            right
                            className={cx(r.aging[b.key] === 0 && "text-slate-300", b.key === "d90plus" && r.aging[b.key] > 0 && "font-semibold text-red-600")}
                          >
                            {r.aging[b.key] === 0 ? "—" : inr(r.aging[b.key])}
                          </Td>
                        ))}
                        <Td right className={cx("font-semibold", r.balance < 0 && "text-brand-700")}>
                          {inr(r.balance)}
                          {r.balance < 0 && <p className="text-[11px] font-normal">advance</p>}
                          {overLimit && <p className="text-[11px] font-normal text-red-600">over credit limit</p>}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <TotalRow>
                    <Td colSpan={2}>Total</Td>
                    {bucketTotals.map((t, i) => (
                      <Td key={BUCKETS[i].key} right className={BUCKETS[i].key === "d90plus" && t > 0 ? "text-red-600" : undefined}>
                        {inr(t)}
                      </Td>
                    ))}
                    <Td right>{inr(data.total)}</Td>
                  </TotalRow>
                </tfoot>
              )}
            </Table>
            <p className="no-print border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              Aging is by bill date of unpaid {isVendor ? "purchases" : "invoices"}. Balance also includes opening balances and unallocated payments.
            </p>
          </Card>
        </div>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Day book ─────────────────────────

interface DayBook {
  sales: { id: string; invoiceNo: string; customerName: string | null; totalAmount: string; paidAmount: string; paymentMode: PaymentMode; status: DocStatus; saleDate: string }[];
  purchases: { id: string; purchaseNo: string; totalAmount: string; paidAmount: string; status: DocStatus; purchaseDate: string; vendor: { name: string } }[];
  payments: {
    id: string;
    paymentNo: string;
    direction: "IN" | "OUT";
    amount: string;
    mode: PaymentMode;
    reference: string | null;
    paymentDate: string;
    saleId: string | null;
    purchaseId: string | null;
    customer: { name: string } | null;
    vendor: { name: string } | null;
    sale: { customerName: string | null } | null;
  }[];
  expenses: { id: string; amount: string; mode: PaymentMode; paidTo: string | null; notes: string | null; category: { name: string } }[];
  returns: { id: string; returnNo: string; saleId: string; totalAmount: string; refundMode: PaymentMode; reason: string | null; sale: { invoiceNo: string } }[];
  byMode: Record<string, { in: number; out: number }>;
  totals: { sales: number; purchases: number; received: number; paid: number; expenses: number };
}

function Section({ title, total, children }: { title: string; total?: number; children: ReactNode }) {
  return (
    <Card title={title} actions={total !== undefined && <span className="num text-sm font-semibold text-slate-800">{inr(total)}</span>} bodyClassName="p-0">
      {children}
    </Card>
  );
}

export function DayBookReport() {
  const [day, setDay] = useState(today());
  const { data, error, loading, reload } = useApi<DayBook>("/reports/daybook", { date: day });

  const modes = data ? Object.entries(data.byMode).sort(([a], [b]) => a.localeCompare(b)) : [];
  const modeTotals = modes.reduce((t, [, v]) => ({ in: t.in + v.in, out: t.out + v.out }), { in: 0, out: 0 });
  const paymentParty = (p: DayBook["payments"][number]) => p.customer?.name ?? p.vendor?.name ?? p.sale?.customerName ?? "Walk-in customer";
  const returnsTotal = data ? round2(data.returns.reduce((s, r) => s + n(r.totalAmount), 0)) : 0;

  function csv() {
    if (!data) return;
    const rows: (string | number | null)[][] = [
      ...data.sales.map((s) => ["Sale", dateTime(s.saleDate), s.invoiceNo, s.customerName ?? "Walk-in", s.paymentMode, n(s.totalAmount), s.status]),
      ...data.purchases.map((p) => ["Purchase", dateTime(p.purchaseDate), p.purchaseNo, p.vendor.name, "", n(p.totalAmount), p.status]),
      ...data.payments.map((p) => [p.direction === "IN" ? "Receipt" : "Payment", dateTime(p.paymentDate), p.paymentNo, paymentParty(p), p.mode, n(p.amount), ""]),
      ...data.expenses.map((e) => ["Expense", day, e.category.name, e.paidTo, e.mode, n(e.amount), ""]),
      ...data.returns.map((r) => ["Sales return", day, r.returnNo, r.sale.invoiceNo, r.refundMode, n(r.totalAmount), ""]),
      ...modes.map(([m, v]) => ["Cash summary", day, m, `in ${v.in}`, `out ${v.out}`, round2(v.in - v.out), ""]),
    ];
    downloadCsv(`daybook-${day}.csv`, ["Section", "Time", "Ref", "Party", "Mode", "Amount", "Status"], rows);
  }

  return (
    <ReportFrame
      title="Day book"
      period={date(day)}
      controls={
        <div className="flex items-center gap-2">
          <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="w-40" aria-label="Date" />
          {day !== today() && (
            <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setDay(today())}>
              Today
            </button>
          )}
        </div>
      }
      onCsv={csv}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Sales" value={inr(data.totals.sales)} sub={`${data.sales.filter((s) => s.status === "COMPLETED").length} invoices`} />
            <Tile label="Received" value={inr(data.totals.received)} tone="green" />
            <Tile label="Purchases" value={inr(data.totals.purchases)} sub={`${data.purchases.length} bills`} />
            <Tile label="Paid out" value={inr(data.totals.paid)} />
            <Tile label="Expenses" value={inr(data.totals.expenses)} />
          </div>

          <Section title="Cash summary by payment mode">
            <Table>
              <thead>
                <tr>
                  <Th>Mode</Th>
                  <Th right>In</Th>
                  <Th right>Out</Th>
                  <Th right>Net</Th>
                </tr>
              </thead>
              <tbody>
                {!modes.length ? (
                  <EmptyRow colSpan={4}>No money moved on this day</EmptyRow>
                ) : (
                  modes.map(([m, v]) => {
                    const net = round2(v.in - v.out);
                    return (
                      <tr key={m}>
                        <Td className="font-medium">{modeLabel(m)}</Td>
                        <Td right className="text-brand-700">
                          {inr(v.in)}
                        </Td>
                        <Td right className="text-red-600">
                          {inr(v.out)}
                        </Td>
                        <Td right className={cx("font-semibold", net < 0 && "text-red-600")}>
                          {inr(net)}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {modes.length > 1 && (
                <tfoot>
                  <TotalRow>
                    <Td>Total</Td>
                    <Td right>{inr(modeTotals.in)}</Td>
                    <Td right>{inr(modeTotals.out)}</Td>
                    <Td right>{inr(modeTotals.in - modeTotals.out)}</Td>
                  </TotalRow>
                </tfoot>
              )}
            </Table>
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              Includes receipts, vendor payments, expenses and refunds on returns. Credit sales are not cash.
            </p>
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title={`Sales (${data.sales.length})`} total={data.totals.sales}>
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th right>Total</Th>
                    <Th right>Paid</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.sales.length ? (
                    <EmptyRow colSpan={4}>No sales</EmptyRow>
                  ) : (
                    data.sales.map((s) => (
                      <tr key={s.id} className={cx("hover:bg-slate-50", s.status === "CANCELLED" && "text-slate-400")}>
                        <Td className="whitespace-nowrap">
                          <Link href={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                            {s.invoiceNo}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {new Date(s.saleDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {modeLabel(s.paymentMode)}
                          </p>
                        </Td>
                        <Td>
                          {s.customerName || "Walk-in customer"}
                          {s.status === "CANCELLED" && (
                            <span className="ml-1">
                              <StatusBadge status="CANCELLED" />
                            </span>
                          )}
                        </Td>
                        <Td right>{inr(s.totalAmount)}</Td>
                        <Td right>{inr(s.paidAmount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Section>

            <Section title={`Purchases (${data.purchases.length})`} total={data.totals.purchases}>
              <Table>
                <thead>
                  <tr>
                    <Th>Purchase</Th>
                    <Th>Vendor</Th>
                    <Th right>Total</Th>
                    <Th right>Paid</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.purchases.length ? (
                    <EmptyRow colSpan={4}>No purchases</EmptyRow>
                  ) : (
                    data.purchases.map((p) => (
                      <tr key={p.id} className={cx("hover:bg-slate-50", p.status === "CANCELLED" && "text-slate-400")}>
                        <Td className="whitespace-nowrap">
                          <Link href={`/purchases/${p.id}`} className="font-medium text-brand-700 hover:underline">
                            {p.purchaseNo}
                          </Link>
                        </Td>
                        <Td>
                          {p.vendor.name}
                          {p.status === "CANCELLED" && (
                            <span className="ml-1">
                              <StatusBadge status="CANCELLED" />
                            </span>
                          )}
                        </Td>
                        <Td right>{inr(p.totalAmount)}</Td>
                        <Td right>{inr(p.paidAmount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Section>

            <Section title={`Receipts & payments (${data.payments.length})`}>
              <Table>
                <thead>
                  <tr>
                    <Th>Voucher</Th>
                    <Th>Party</Th>
                    <Th>Mode</Th>
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.payments.length ? (
                    <EmptyRow colSpan={4}>No receipts or payments</EmptyRow>
                  ) : (
                    data.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <Td className="whitespace-nowrap">
                          <span className="font-medium text-slate-800">{p.paymentNo}</span>
                          <span className="ml-1.5">
                            <Badge tone={p.direction === "IN" ? "green" : "amber"}>{p.direction === "IN" ? "Received" : "Paid"}</Badge>
                          </span>
                        </Td>
                        <Td>{paymentParty(p)}</Td>
                        <Td>
                          {modeLabel(p.mode)}
                          {p.reference && <p className="text-xs text-slate-500">{p.reference}</p>}
                        </Td>
                        <Td right className={cx("font-medium", p.direction === "IN" ? "text-brand-700" : "text-red-600")}>
                          {p.direction === "IN" ? "+" : "−"}
                          {inr(p.amount)}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Section>

            <Section title={`Expenses (${data.expenses.length})`} total={data.totals.expenses}>
              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th>Paid to</Th>
                    <Th>Mode</Th>
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.expenses.length ? (
                    <EmptyRow colSpan={4}>No expenses</EmptyRow>
                  ) : (
                    data.expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <Td className="font-medium">
                          {e.category.name}
                          {e.notes && <p className="max-w-56 truncate text-xs font-normal text-slate-500">{e.notes}</p>}
                        </Td>
                        <Td>{e.paidTo || "—"}</Td>
                        <Td>{modeLabel(e.mode)}</Td>
                        <Td right>{inr(e.amount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Section>

            <Section title={`Sales returns (${data.returns.length})`} total={returnsTotal}>
              <Table>
                <thead>
                  <tr>
                    <Th>Return</Th>
                    <Th>Against invoice</Th>
                    <Th>Refund</Th>
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.returns.length ? (
                    <EmptyRow colSpan={4}>No returns</EmptyRow>
                  ) : (
                    data.returns.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <Td className="font-medium">
                          {r.returnNo}
                          {r.reason && <p className="max-w-56 truncate text-xs font-normal text-slate-500">{r.reason}</p>}
                        </Td>
                        <Td>
                          <Link href={`/sales/${r.saleId}`} className="text-brand-700 hover:underline">
                            {r.sale.invoiceNo}
                          </Link>
                        </Td>
                        <Td>{r.refundMode === "CREDIT" ? "Adjusted to account" : modeLabel(r.refundMode)}</Td>
                        <Td right>{inr(r.totalAmount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Section>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

