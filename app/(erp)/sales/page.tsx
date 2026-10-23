"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, downloadCsv, inr, monthStart, n, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged, Sale } from "@/lib/types";

export default function SalesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [paymentStatus, setPaymentStatus] = useState("");
  const [status, setStatus] = useState("COMPLETED");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);

  const filters = { search: q, from, to, paymentStatus, status };
  const { data, error, loading, reload } = useApi<Paged<Sale>>("/sales", { ...filters, page, pageSize: 25 });

  const total = n(data?.totalAmount);
  const paid = n(data?.paidAmount);

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Sale>>("/sales", { ...filters, pageSize: 500 });
      downloadCsv(
        `invoices_${from || "all"}_${to || "all"}.csv`,
        ["Invoice No", "Date", "Customer", "Phone", "Items", "Taxable", "Tax", "Discount", "Total", "Paid", "Balance", "Mode", "Payment Status", "Status", "Billed By", "Agent ID", "Agent"],
        all.items.map((s) => [
          s.invoiceNo,
          date(s.saleDate),
          s.customer?.name ?? s.customerName ?? "Cash customer",
          s.customer?.phone ?? s.customerPhone,
          s._count?.items,
          n(s.subtotal),
          n(s.taxAmount),
          n(s.discount),
          n(s.totalAmount),
          n(s.paidAmount),
          s.status === "CANCELLED" ? 0 : n(s.totalAmount) - n(s.paidAmount),
          s.paymentMode,
          s.paymentStatus,
          s.status,
          s.user?.name,
          s.agent?.agentId,
          s.agent ? [s.agent.firstName, s.agent.lastName].filter(Boolean).join(" ") : "",
        ]),
      );
      if (all.total > all.items.length) toast.error(`Exported the first ${all.items.length} of ${all.total} invoices — narrow the date range`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Sales Invoices"
        subtitle="All bills raised at the counter"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
              Export
            </Button>
            {can("sales.bill") && (
              <Link href="/sales/new">
                <Button icon={<Plus className="size-4" />}>New Sale</Button>
              </Link>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Invoice no, customer, phone or agent ID…"
            className="w-full flex-1 sm:w-auto sm:min-w-60"
          />
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <DateInput value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
            <span className="text-xs text-slate-400">to</span>
            <DateInput value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
          </div>
          <Select value={paymentStatus} onChange={(e) => resetPage(setPaymentStatus)(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Payment status">
            <option value="">Any Payment</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Status">
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="all">All</option>
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Agent</Th>
                <Th right>Items</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th right>Balance</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={9} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={9}>
                  No invoices for these filters.{" "}
                  {can("sales.bill") && (
                    <Link href="/sales/new" className="font-medium text-brand-700 underline">
                      Create a Sale
                    </Link>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((s) => {
                  const cancelled = s.status === "CANCELLED";
                  const bal = cancelled ? 0 : n(s.totalAmount) - n(s.paidAmount);
                  return (
                    <tr key={s.id} className={cancelled ? "bg-slate-50/60 text-slate-400" : "hover:bg-slate-50"}>
                      <Td>
                        <Link href={`/sales/${s.id}`} className={cancelled ? "font-medium text-slate-500 line-through" : "font-medium text-slate-900 hover:text-brand-700"}>
                          {s.invoiceNo}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {dateTime(s.saleDate)}
                          {s.user?.name && ` · ${s.user.name}`}
                        </p>
                      </Td>
                      <Td>
                        {s.customer && can("customers.view") ? (
                          <Link href={`/customers/${s.customer.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                            {s.customer.name}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{s.customer?.name ?? (s.customerName || "Cash customer")}</span>
                        )}
                        {(s.customer?.phone ?? s.customerPhone) && <p className="text-xs text-slate-500">{s.customer?.phone ?? s.customerPhone}</p>}
                      </Td>
                      <Td>
                        {s.agent ? (
                          <>
                            <p className="font-mono text-xs font-medium text-slate-800">{s.agent.agentId}</p>
                            <p className="text-xs text-slate-500">{[s.agent.firstName, s.agent.lastName].filter(Boolean).join(" ")}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                      <Td right className="text-slate-500">
                        {s._count?.items ?? "—"}
                      </Td>
                      <Td right className="font-medium">
                        {inr(s.totalAmount)}
                      </Td>
                      <Td right>{inr(s.paidAmount)}</Td>
                      <Td right className={bal > 0.004 ? "font-medium text-red-600" : "text-slate-400"}>
                        {bal > 0.004 ? inr(bal) : "—"}
                      </Td>
                      <Td className="text-xs">{s.paymentMode}</Td>
                      <Td>
                        {cancelled ? <Badge tone="red">Cancelled</Badge> : <StatusBadge status={s.paymentStatus} />}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={4} className="text-xs uppercase tracking-wide text-slate-500">
                    Total ({data.total} invoice{data.total === 1 ? "" : "s"})
                  </Td>
                  <Td right>{inr(total)}</Td>
                  <Td right>{inr(paid)}</Td>
                  <Td right className={total - paid > 0.004 ? "text-red-600" : undefined}>
                    {inr(Math.max(0, total - paid))}
                  </Td>
                  <Td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
