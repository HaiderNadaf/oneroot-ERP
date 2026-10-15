"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RequirePerm } from "@/components/AppShell";
import { PoForm } from "@/components/PoForm";
import { ErrorBox, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { PurchaseOrder } from "@/lib/types";

export default function EditPurchaseOrderPage() {
  return (
    <RequirePerm perms={["purchases.manage"]}>
      <EditPurchaseOrder />
    </RequirePerm>
  );
}

function EditPurchaseOrder() {
  const { id } = useParams<{ id: string }>();
  const { data: po, error, loading, reload } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !po) return <Spinner page />;

  return (
    <>
      <div className="mb-2">
        <Link href={`/purchase-orders/${po.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> {po.poNo}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Edit {po.poNo}
            <StatusBadge status={po.status} />
          </span>
        }
        subtitle={`Approval round ${po.round}`}
      />
      {po.canEdit ? (
        <PoForm key={po.id} po={po} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          This PO can no longer be edited — it is {po.status.toLowerCase().replace(/_/g, " ")}
          {po.receivedPct > 0 && " and goods have already been received against it"}.{" "}
          <Link href={`/purchase-orders/${po.id}`} className="font-medium text-brand-700 underline">
            Back to the PO
          </Link>
        </div>
      )}
    </>
  );
}
