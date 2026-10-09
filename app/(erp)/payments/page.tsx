"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CASH_MODES, PartyPaymentForm, modeLabel } from "@/components/PartyPaymentForm";
import {
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  Input,
  LoadingRow,
  PageHeader,
  Pagination,
  Select,
  Table,
  Tabs,
  Td,
  Th,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, monthStart, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Paged, Payment } from "@/lib/types";

type Direction = "IN" | "OUT";

function partyOf(p: Payment) {
  if (p.customer) return { name: p.customer.name, href: `/customers/${p.customer.id}` };
  if (p.vendor) return { name: p.vendor.name, href: `/vendors/${p.vendor.id}` };
  return { name: p.sale?.customerName || "Walk-in customer", href: null };
}

function againstOf(p: Payment) {
  if (p.sale) return { label: p.sale.invoiceNo, href: `/sales/${p.sale.id}` };
  if (p.purchase) return { label: p.purchase.purchaseNo, href: `/purchases/${p.purchase.id}` };
  return null;
}

export default function PaymentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [direction, setDirection] = useState<Direction>("IN");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [mode, setMode] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const canDelete = can("MANAGER", "ACCOUNTANT");

  const filters = { direction, from, to, mode };
  const { data, error, loading, reload } = useApi<Paged<Payment>>("/payments", { ...filters, page, pageSize: 25 });
  const isIn = direction === "IN";

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Payment>>("/payments", { ...filters, pageSize: 500 });
      downloadCsv(
        `${isIn ? "receipts" : "vendor-payments"}-${from || "all"}-to-${to || "today"}.csv`,
        ["Payment no", "Date", isIn ? "Customer" : "Vendor", "Against", "Mode", "Reference", "Amount", "Notes"],
        all.items.map((p) => [
          p.paymentNo,
          date(p.paymentDate),
          partyOf(p).name,
          againstOf(p)?.label ?? "On account",
          p.mode,
          p.reference,
          n(p.amount),
          p.notes,
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  async function remove(p: Payment) {
    const party = partyOf(p).name;
    const ok = await confirm(
      `Delete ${p.paymentNo} (${inr(p.amount)} ${isIn ? "from" : "to"} ${party})? This reverses the payment: ${
        isIn ? "the customer's balance due" : "the amount payable to the vendor"
      } goes back up by ${inr(p.amount)} and the linked bill${p.sale || p.purchase ? "" : "s"} become unpaid again.`,
      { danger: true, confirmLabel: "Delete payment" },
    );
    if (!ok) return;
    setDeleting(p.id);
    try {
      await api.del(`/payments/${p.id}`);
      toast.success(`${p.paymentNo} deleted · balance reversed`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeleting(null);
    }
  }

  const cols = canDelete ? 8 : 7;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money received from customers and paid to vendors"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
              Export
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
              New payment
            </Button>
          </>
        }
      />

      <Tabs<Direction>
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setPage(1);
        }}
        tabs={[
          { value: "IN", label: "Received (from customers)" },
          { value: "OUT", label: "Paid (to vendors)" },
        ]}
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex items-center gap-1.5">
            <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="w-38" aria-label="From date" />
            <span className="text-xs text-slate-400">to</span>
            <Input type="date" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="w-38" aria-label="To date" />
          </div>
          <Select value={mode} onChange={(e) => (setMode(e.target.value), setPage(1))} className="w-40" aria-label="Mode">
            <option value="">All modes</option>
            {CASH_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
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
          {data && (
            <p className="ml-auto text-sm text-slate-500">
              Total {isIn ? "received" : "paid"}:{" "}
              <span className={`num font-semibold ${isIn ? "text-brand-700" : "text-amber-700"}`}>{inr(data.totalAmount)}</span>
            </p>
          )}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Payment no.</Th>
                <Th>Date</Th>
                <Th>{isIn ? "Customer" : "Vendor"}</Th>
                <Th>Against</Th>
                <Th>Mode</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
                {canDelete && <Th />}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={cols} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={cols}>No {isIn ? "receipts" : "vendor payments"} for these filters</EmptyRow>
              ) : (
                data.items.map((p) => {
                  const party = partyOf(p);
                  const against = againstOf(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">{p.paymentNo}</Td>
                      <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                      <Td>
                        {party.href ? (
                          <Link href={party.href} className="hover:text-brand-700">
                            {party.name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{party.name}</span>
                        )}
                      </Td>
                      <Td>
                        {against?.href ? (
                          <Link href={against.href} className="text-brand-700 hover:underline">
                            {against.label}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">On account</span>
                        )}
                      </Td>
                      <Td>{modeLabel(p.mode)}</Td>
                      <Td className="max-w-48 truncate text-slate-500">{p.reference || "—"}</Td>
                      <Td right className="font-medium text-slate-900">
                        {inr(p.amount)}
                      </Td>
                      {canDelete && (
                        <Td right>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(p)}
                            loading={deleting === p.id}
                            icon={<Trash2 className="size-4" />}
                            aria-label={`Delete ${p.paymentNo}`}
                            className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                          />
                        </Td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <PartyPaymentForm
        open={formOpen}
        defaultType={isIn ? "CUSTOMER" : "VENDOR"}
        onClose={() => setFormOpen(false)}
        onSaved={(p) => {
          setFormOpen(false);
          if (p.direction !== direction) {
            setDirection(p.direction);
            setPage(1);
          } else void reload();
        }}
      />
    </>
  );
}
