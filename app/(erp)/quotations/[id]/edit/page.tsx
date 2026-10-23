"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RequirePerm } from "@/components/AppShell";
import { QuotationForm } from "@/components/QuotationForm";
import { ErrorBox, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { Quotation } from "@/lib/types";

export default function EditQuotationPage() {
  return (
    <RequirePerm perms={["sales.bill"]}>
      <EditQuotation />
    </RequirePerm>
  );
}

function EditQuotation() {
  const { id } = useParams<{ id: string }>();
  const { data: q, error, loading, reload } = useApi<Quotation>(`/quotations/${id}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !q) return <Spinner page />;

  return (
    <>
      <div className="mb-2">
        <Link href={`/quotations/${q.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> {q.quotationNo}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Edit {q.quotationNo}
            <StatusBadge status={q.status} />
          </span>
        }
      />
      {q.status === "OPEN" ? (
        <QuotationForm key={q.id} quotation={q} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-surface px-4 py-6 text-center text-sm text-slate-600">
          This quotation is {q.status.toLowerCase()} — only open quotations can be edited.{" "}
          <Link href={`/quotations/${q.id}`} className="font-medium text-brand-700 underline">
            Back to the quotation
          </Link>
        </div>
      )}
    </>
  );
}
