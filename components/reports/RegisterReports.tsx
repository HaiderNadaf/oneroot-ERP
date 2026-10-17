"use client";

import { useMemo, type ReactNode } from "react";
import { Card, EmptyRow, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { date, downloadCsv, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Purchase, Sale } from "@/lib/types";
import { ReportFrame, ReportLink, SortTh, TotalRow, periodLabel, useSort, type Range } from "./ReportKit";

// ───────────────────────── Sales register ─────────────────────────

interface SalesRegister {
  rows: (Sale & { customer?: { name: string; gstin?: string | null } | null })[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number; paid: number };
}

export function SalesRegisterReport({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<SalesRegister>("/reports/sales-register", { ...range });
  const party = (s: SalesRegister["rows"][number]) => s.customer?.name ?? s.customerName ?? "Walk-in customer";

  function csv() {
    if (!data) return;
    downloadCsv(
      `sales-register-${range.from}-to-${range.to}.csv`,
      ["Date", "Invoice", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total", "Paid", "Balance", "Mode", "Status"],
      [
        ...data.rows.map((s) => [
          s.saleDate.slice(0, 10),
          s.invoiceNo,
          party(s),
          s.customer?.gstin,
          n(s.subtotal),
          n(s.cgst),
          n(s.sgst),
          n(s.igst),
          n(s.totalAmount),
          n(s.paidAmount),
          round2(n(s.totalAmount) - n(s.paidAmount)),
          s.paymentMode,
          s.paymentStatus,
        ]),
        ["", "TOTAL", "", "", data.totals.taxable, data.totals.cgst, data.totals.sgst, data.totals.igst, data.totals.total, data.totals.paid, round2(data.totals.total - data.totals.paid), "", ""],
      ],
    );
  }

  return (
    <ReportFrame title="Sales Register" period={periodLabel(range)} controls={rangeBar} onCsv={csv} loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th right>Taxable</Th>
                <Th right>CGST</Th>
                <Th right>SGST</Th>
                <Th right>IGST</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {!data.rows.length ? (
                <EmptyRow colSpan={10}>No invoices in this period</EmptyRow>
              ) : (
                data.rows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{date(s.saleDate)}</Td>
                    <Td className="whitespace-nowrap">
                      <ReportLink href={`/sales/${s.id}`} perms={["sales.bill"]} className="font-medium text-brand-700 hover:underline">
                        {s.invoiceNo}
                      </ReportLink>
                    </Td>
                    <Td>
                      {party(s)}
                      {s.customer?.gstin && <p className="text-xs text-slate-500">{s.customer.gstin}</p>}
                    </Td>
                    <Td right>{inr(s.subtotal)}</Td>
                    <Td right>{inr(s.cgst)}</Td>
                    <Td right>{inr(s.sgst)}</Td>
                    <Td right>{inr(s.igst)}</Td>
                    <Td right className="font-medium">
                      {inr(s.totalAmount)}
                    </Td>
                    <Td right>{inr(s.paidAmount)}</Td>
                    <Td>
                      <StatusBadge status={s.paymentStatus} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <TotalRow>
                  <Td colSpan={3}>Total · {data.rows.length} invoices</Td>
                  <Td right>{inr(data.totals.taxable)}</Td>
                  <Td right>{inr(data.totals.cgst)}</Td>
                  <Td right>{inr(data.totals.sgst)}</Td>
                  <Td right>{inr(data.totals.igst)}</Td>
                  <Td right>{inr(data.totals.total)}</Td>
                  <Td right>{inr(data.totals.paid)}</Td>
                  <Td />
                </TotalRow>
              </tfoot>
            )}
          </Table>
        </Card>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Purchase register ─────────────────────────

interface PurchaseRegister {
  rows: (Purchase & { vendor?: { name: string; gstin?: string | null } })[];
  totals: { taxable: number; tax: number; total: number; paid: number };
}

export function PurchaseRegisterReport({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<PurchaseRegister>("/reports/purchase-register", { ...range });

  function csv() {
    if (!data) return;
    downloadCsv(
      `purchase-register-${range.from}-to-${range.to}.csv`,
      ["Date", "Purchase No", "Vendor Invoice", "Vendor", "GSTIN", "Taxable", "GST", "Other Charges", "Total", "Paid", "Balance", "Status"],
      [
        ...data.rows.map((p) => [
          p.purchaseDate.slice(0, 10),
          p.purchaseNo,
          p.vendorInvoiceNo,
          p.vendor?.name,
          p.vendor?.gstin,
          n(p.subtotal),
          n(p.taxAmount),
          n(p.otherCharges),
          n(p.totalAmount),
          n(p.paidAmount),
          round2(n(p.totalAmount) - n(p.paidAmount)),
          p.paymentStatus,
        ]),
        ["", "TOTAL", "", "", "", data.totals.taxable, data.totals.tax, "", data.totals.total, data.totals.paid, round2(data.totals.total - data.totals.paid), ""],
      ],
    );
  }

  return (
    <ReportFrame title="Purchase Register" period={periodLabel(range)} controls={rangeBar} onCsv={csv} loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Purchase</Th>
                <Th>Vendor</Th>
                <Th right>Taxable</Th>
                <Th right>GST</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {!data.rows.length ? (
                <EmptyRow colSpan={8}>No purchases in this period</EmptyRow>
              ) : (
                data.rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{date(p.purchaseDate)}</Td>
                    <Td className="whitespace-nowrap">
                      <ReportLink href={`/purchases/${p.id}`} perms={["purchases.view"]} className="font-medium text-brand-700 hover:underline">
                        {p.purchaseNo}
                      </ReportLink>
                      {p.vendorInvoiceNo && <p className="text-xs text-slate-500">Bill {p.vendorInvoiceNo}</p>}
                    </Td>
                    <Td>
                      {p.vendor?.name ?? "—"}
                      {p.vendor?.gstin && <p className="text-xs text-slate-500">{p.vendor.gstin}</p>}
                    </Td>
                    <Td right>{inr(p.subtotal)}</Td>
                    <Td right>{inr(p.taxAmount)}</Td>
                    <Td right className="font-medium">
                      {inr(p.totalAmount)}
                    </Td>
                    <Td right>{inr(p.paidAmount)}</Td>
                    <Td>
                      <StatusBadge status={p.paymentStatus} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <TotalRow>
                  <Td colSpan={3}>Total · {data.rows.length} purchases</Td>
                  <Td right>{inr(data.totals.taxable)}</Td>
                  <Td right>{inr(data.totals.tax)}</Td>
                  <Td right>{inr(data.totals.total)}</Td>
                  <Td right>{inr(data.totals.paid)}</Td>
                  <Td />
                </TotalRow>
              </tfoot>
            )}
          </Table>
        </Card>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Product-wise sales ─────────────────────────

interface ProductSalesRow {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

const EMPTY: ProductSalesRow[] = [];

export function ProductSalesReport({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<{ rows: ProductSalesRow[] }>("/reports/product-sales", { ...range });
  const rows = data?.rows ?? EMPTY;
  const sort = useSort<ProductSalesRow, keyof ProductSalesRow>(rows, "revenue");
  const totals = useMemo(() => {
    const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const cost = round2(rows.reduce((s, r) => s + r.cost, 0));
    const profit = round2(rows.reduce((s, r) => s + r.profit, 0));
    const net = round2(cost + profit);
    return { revenue, cost, profit, marginPct: net > 0 ? round2((profit / net) * 100) : 0 };
  }, [rows]);

  function csv() {
    downloadCsv(
      `product-sales-${range.from}-to-${range.to}.csv`,
      ["Product", "Unit", "Qty Sold", "Revenue (Incl. GST)", "Cost", "Profit", "Margin %"],
      [
        ...sort.sorted.map((r) => [r.name, r.unit, r.quantity, r.revenue, r.cost, r.profit, r.marginPct]),
        ["TOTAL", "", "", totals.revenue, totals.cost, totals.profit, totals.marginPct],
      ],
    );
  }

  return (
    <ReportFrame title="Product-Wise Sales" period={periodLabel(range)} controls={rangeBar} onCsv={csv} loading={loading} error={error} onRetry={reload} hasData={!!data}>
      {data && (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <SortTh label="Product" k="name" sort={sort} />
                <SortTh label="Qty Sold" k="quantity" sort={sort} right />
                <SortTh label="Revenue" k="revenue" sort={sort} right />
                <SortTh label="Cost" k="cost" sort={sort} right />
                <SortTh label="Profit" k="profit" sort={sort} right />
                <SortTh label="Margin" k="marginPct" sort={sort} right />
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <EmptyRow colSpan={6}>No sales in this period</EmptyRow>
              ) : (
                sort.sorted.map((r) => (
                  <tr key={`${r.productId}-${r.name}`} className="hover:bg-slate-50">
                    <Td>
                      <ReportLink href={`/products/${r.productId}`} perms={["products.view"]} className="font-medium text-slate-900 hover:text-brand-700">
                        {r.name}
                      </ReportLink>
                    </Td>
                    <Td right>
                      {qty(r.quantity)} <span className="text-xs text-slate-500">{r.unit}</span>
                    </Td>
                    <Td right className="font-medium">
                      {inr(r.revenue)}
                    </Td>
                    <Td right>{inr(r.cost)}</Td>
                    <Td right className={r.profit < 0 ? "text-red-600" : undefined}>
                      {inr(r.profit)}
                    </Td>
                    <Td right>
                      <span className={cx(r.marginPct < 0 ? "text-red-600" : r.marginPct < 5 ? "text-amber-700" : "text-slate-700")}>{r.marginPct}%</span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <TotalRow>
                  <Td colSpan={2}>Total · {rows.length} products</Td>
                  <Td right>{inr(totals.revenue)}</Td>
                  <Td right>{inr(totals.cost)}</Td>
                  <Td right>{inr(totals.profit)}</Td>
                  <Td right>{totals.marginPct}%</Td>
                </TotalRow>
              </tfoot>
            )}
          </Table>
          <p className="no-print border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
            Net of returns. Revenue includes GST; profit and margin are calculated on revenue excluding GST.
          </p>
        </Card>
      )}
    </ReportFrame>
  );
}
