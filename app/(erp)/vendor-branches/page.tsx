"use client";

import { RequirePerm } from "@/components/AppShell";
import { VendorBranchList } from "@/components/VendorBranches";
import { PageHeader } from "@/components/ui";

export default function VendorBranchesPage() {
  return (
    <RequirePerm perms={["vendors.view"]}>
      <PageHeader title="Depot" subtitle="Each vendor and the depots / branches it supplies from — pick one on a purchase order and its address and GSTIN go on the PO" />
      <VendorBranchList />
    </RequirePerm>
  );
}
