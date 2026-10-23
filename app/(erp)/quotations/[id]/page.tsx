"use client";

import { ArrowLeft, Ban, Check, Pencil, Plus, Printer, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { QuotationDocument, isExpired } from "@/components/QuotationDocument";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, StatusBadge, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { printAs } from "@/lib/print";
import type { Quotation, QuotationStatus, StoreSettings } from "@/lib/types";

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: q, error, loading, reload } = useApi<Quotation>(`/quotations/${id}`);
  const { data: settings } = useApi<StoreSettings>("/settings");
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !q) return <Spinner page />;
  if (!q) return null;

  const open = q.status === "OPEN";
  const cancelled = q.status === "CANCELLED";
  const expired = isExpired(q);
  const canBill = can("sales.bill");
  const short = (q.items ?? []).filter((i) => i.product?.stock !== undefined && n(i.product.stock) < n(i.quantity));

  async function setStatus(status: Exclude<QuotationStatus, "CANCELLED">, label: string) {
    setBusy(status);
    try {
      await api.patch(`/quotations/${q!.id}/status`, { status });
      toast.success(`${q!.quotationNo} ${label}`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!(await confirm(`Cancel quotation ${q!.quotationNo}? It stays on record but can no longer be edited.`, { danger: true, confirmLabel: "Cancel Quotation" }))) return;
    setBusy("CANCELLED");
    try {
      await api.del(`/quotations/${q!.id}`);
      toast.success(`${q!.quotationNo} cancelled`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {q.quotationNo}
            <StatusBadge status={q.status} />
            {expired && <Badge tone="amber">Expired</Badge>}
          </span>
        }
        subtitle={
          <>
            {dateTime(q.quotationDate)}
            {q.user?.name && ` · by ${q.user.name}`}
          </>
        }
        actions={
          <>
            <Link href="/quotations">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
                Quotations
              </Button>
            </Link>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => printAs("a4", undefined, q.quotationNo)}>
              Print / PDF
            </Button>
            {open && canBill && (
              <Link href={`/quotations/${q.id}/edit`}>
                <Button variant="secondary" icon={<Pencil className="size-4" />}>
                  Edit
                </Button>
              </Link>
            )}
            {!cancelled && can("sales.cancel") && (
              <Button variant="danger" icon={<Ban className="size-4" />} loading={busy === "CANCELLED"} onClick={cancel}>
                Cancel
              </Button>
            )}
            {canBill && (
              <Link href="/quotations/new">
                <Button icon={<Plus className="size-4" />}>New Quotation</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="paper print-area min-w-0 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-8">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <QuotationDocument quotation={q} settings={settings} />
            </div>
          </div>
        </div>

        <div className="no-print space-y-4">
          <Card title="Customer's Answer">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Quoted Total</dt>
                <dd className="num font-semibold text-slate-900">{inr(q.totalAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Valid Until</dt>
                <dd className={expired ? "font-medium text-amber-700" : "text-slate-800"}>{q.validUntil ? date(q.validUntil) : "No expiry"}</dd>
              </div>
            </dl>
            {canBill && !cancelled && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {q.status !== "ACCEPTED" && (
                  <Button size="sm" icon={<Check className="size-4" />} loading={busy === "ACCEPTED"} onClick={() => setStatus("ACCEPTED", "marked accepted")}>
                    Accepted
                  </Button>
                )}
                {q.status !== "REJECTED" && (
                  <Button size="sm" variant="secondary" icon={<X className="size-4" />} loading={busy === "REJECTED"} onClick={() => setStatus("REJECTED", "marked rejected")}>
                    Rejected
                  </Button>
                )}
                {!open && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} loading={busy === "OPEN"} onClick={() => setStatus("OPEN", "reopened")}>
                    Reopen
                  </Button>
                )}
              </div>
            )}
            {q.customerId && can("customers.view") && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Registered customer:{" "}
                <Link href={`/customers/${q.customerId}`} className="font-medium text-brand-700 hover:underline">
                  {q.customerName}
                </Link>
              </p>
            )}
          </Card>

          {short.length > 0 && !cancelled && (
            <Card title="Stock Check">
              <p className="mb-2 text-xs text-slate-500">Current stock is below the quoted quantity for:</p>
              <ul className="space-y-1 text-sm">
                {short.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-800">{i.productName}</span>
                    <span className="num shrink-0 text-amber-700">
                      {n(i.product!.stock)} / {n(i.quantity)} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
