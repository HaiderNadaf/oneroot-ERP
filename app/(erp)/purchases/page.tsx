"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { VendorPicker } from "@/components/pickers";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  Input,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
  cx,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, daysUntil, downloadCsv, inr, monthStart, n, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged, Purchase, Vendor } from "@/lib/types";

export default function PurchasesPage() {
  return (
    <RequirePerm perms={["purchases.view"]}>
      <Purchases />
    </RequirePerm>
  );
}

function Purchases() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [paymentStatus, setPaymentStatus] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);

  const filters = { search: q, vendorId: vendor?.id, from, to, paymentStatus, status };
  const { data, error, loading, reload } = useApi<Paged<Purchase>>("/purchases", { ...filters, page, pageSize: 25 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Purchase>>("/purchases", { ...filters, pageSize: 500 });
      downloadCsv(
        `purchases-${from || "all"}-to-${to || "today"}.csv`,
        ["Bill no", "Vendor invoice", "GRN", "Rate mismatch", "Date", "Due date", "Vendor", "Items", "Total", "Paid", "Balance", "Payment status", "Status"],
        all.items.map((p) => [
          p.purchaseNo,
          p.vendorInvoiceNo,
          p.grn?.grnNo ?? "",
          p.rateMismatch ? "Yes" : "",
          date(p.purchaseDate),
          p.dueDate ? date(p.dueDate) : "",
          p.vendor?.name,
          p._count?.items,
          n(p.totalAmount),
          n(p.paidAmount),
          p.status === "COMPLETED" ? n(p.totalAmount) - n(p.paidAmount) : 0,
          p.paymentStatus,
          p.status,
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  const total = n(data?.totalAmount);
  const paid = n(data?.paidAmount);

  return (
    <>
      <PageHeader
        title="Purchase Invoices"
        subtitle={
          <>
            Vendor bills — booked from{" "}
            <Link href="/goods-inward" className="text-brand-700 hover:underline">
              Goods Inward
            </Link>{" "}
            against a PO, or entered as a direct purchase for quick buys without a PO
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
              Export
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => router.push("/purchases/new")}
              title="For quick buys without a purchase order — stock is added immediately"
            >
              Direct purchase
            </Button>
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto]">
          <SearchInput value={search} onChange={reset(setSearch)} placeholder="Bill no., vendor invoice, vendor…" />
          <VendorPicker value={vendor} onChange={reset(setVendor)} />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="min-w-0 flex-1 lg:w-38 lg:flex-none" aria-label="From date" />
            <span className="shrink-0 text-xs text-slate-400">to</span>
            <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="min-w-0 flex-1 lg:w-38 lg:flex-none" aria-label="To date" />
          </div>
          <Select value={paymentStatus} onChange={(e) => reset(setPaymentStatus)(e.target.value)} className="lg:w-36" aria-label="Payment status">
            <option value="">Any payment</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partly paid</option>
            <option value="PAID">Paid</option>
          </Select>
          <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className="lg:w-32" aria-label="Status">
            <option value="">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="all">All</option>
          </Select>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              All dates
            </Button>
          )}
        </div>

        {data && (
          // Phones: one row per figure; wider: three columns side by side
          <div className="grid grid-cols-1 divide-y divide-slate-100 border-b border-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:text-center">
            <div className="flex items-center justify-between gap-3 px-3 py-2 sm:block sm:py-2.5">
              <p className="text-xs text-slate-500">Bill value</p>
              <p className="num font-semibold text-slate-900">{inr(total)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 sm:block sm:py-2.5">
              <p className="text-xs text-slate-500">Paid</p>
              <p className="num font-semibold text-brand-700">{inr(paid)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 sm:block sm:py-2.5">
              <p className="text-xs text-slate-500">Outstanding</p>
              <p className={cx("num font-semibold", total - paid > 0 ? "text-amber-700" : "text-slate-900")}>
                {inr(status === "CANCELLED" ? 0 : total - paid)}
              </p>
            </div>
          </div>
        )}

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Date</Th>
                <Th>Vendor</Th>
                <Th right className="hidden md:table-cell">Items</Th>
                <Th right>Total</Th>
                <Th right>Balance</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={8} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={8}>
                  No purchase invoices found for these filters.{" "}
                  <Link href="/goods-inward" className="font-medium text-brand-700 underline">
                    Book one from Goods Inward
                  </Link>
                </EmptyRow>
              ) : (
                data.items.map((p) => {
                  const cancelled = p.status === "CANCELLED";
                  const due = cancelled ? 0 : n(p.totalAmount) - n(p.paidAmount);
                  const days = due > 0 ? daysUntil(p.dueDate) : null;
                  return (
                    <tr key={p.id} className={cx("hover:bg-slate-50", cancelled && "opacity-60")}>
                      <Td>
                        <Link href={`/purchases/${p.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                          {p.purchaseNo}
                        </Link>
                        {p.vendorInvoiceNo && <p className="text-xs text-slate-500">Inv {p.vendorInvoiceNo}</p>}
                        {p.grnId && (
                          <Link href={`/goods-inward/${p.grnId}`} className="block text-xs text-brand-700 hover:underline">
                            via {p.grn?.grnNo ?? "GRN"}
                          </Link>
                        )}
                        {p.rateMismatch && (
                          <span className="mt-0.5 inline-block">
                            <Badge tone="amber">Rate mismatch</Badge>
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{date(p.purchaseDate)}</Td>
                      <Td className="min-w-36">
                        {p.vendor ? (
                          <Link href={`/vendors/${p.vendor.id}`} className="hover:text-brand-700">
                            {p.vendor.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td right className="hidden text-slate-500 md:table-cell">
                        {p._count?.items ?? "—"}
                      </Td>
                      <Td right className="font-medium">
                        {inr(p.totalAmount)}
                      </Td>
                      <Td right className={due > 0 ? "font-medium text-amber-700" : "text-slate-400"}>
                        {inr(due)}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {p.dueDate && due > 0 ? (
                          <>
                            {date(p.dueDate)}
                            {days !== null && days < 0 && <p className="text-red-600">{-days}d overdue</p>}
                            {days !== null && days >= 0 && days <= 7 && <p className="text-amber-700">{days === 0 ? "due today" : `in ${days}d`}</p>}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                      <Td>{cancelled ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={p.paymentStatus} />}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
