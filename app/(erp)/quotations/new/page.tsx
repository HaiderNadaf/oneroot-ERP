"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RequirePerm } from "@/components/AppShell";
import { QuotationForm } from "@/components/QuotationForm";
import { PageHeader } from "@/components/ui";

export default function NewQuotationPage() {
  return (
    <RequirePerm perms={["sales.bill"]}>
      <div className="mb-2">
        <Link href="/quotations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Quotations
        </Link>
      </div>
      <PageHeader title="New Quotation" subtitle="Quote prices to a customer — no stock or money moves" />
      <QuotationForm />
    </RequirePerm>
  );
}
