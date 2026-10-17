"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RequirePerm } from "@/components/AppShell";
import { PoForm } from "@/components/PoForm";
import { PageHeader } from "@/components/ui";

export default function NewPurchaseOrderPage() {
  return (
    <RequirePerm perms={["purchases.manage"]}>
      <NewPurchaseOrder />
    </RequirePerm>
  );
}

function NewPurchaseOrder() {
  const params = useSearchParams();
  return (
    <>
      <div className="mb-2">
        <Link href="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Purchase Orders
        </Link>
      </div>
      <PageHeader title="New Purchase Order" subtitle="Order stock from a vendor; it goes for approval before goods can be received" />
      <PoForm presetVendorId={params.get("vendorId")} />
    </>
  );
}
