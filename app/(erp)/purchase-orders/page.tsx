"use client";

import { ClipboardCheck, Eye, PackageCheck, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApprovalChain } from "@/components/ApprovalChain";
import { RequireRole } from "@/components/AppShell";
import { BranchCode } from "@/components/BranchNotice";
import { Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, StatusBadge, Table, Tabs, Td, Th, cx } from "@/components/ui";
import { date, inr, n } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import type { PoStatus, PurchaseOrder, Paged } from "@/lib/types";

type Filter = "" | PoStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "SENT_BACK", label: "Sent back" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_RECEIVED", label: "Partially received" },
  { value: "RECEIVED", label: "Received" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Draft" },
  { value: "CANCELLED", label: "Cancelled" },
];

interface PoList extends Paged<PurchaseOrder> {
  counts: Partial<Record<PoStatus, number>>;
  totalValue: string | number;
}

export default function PurchaseOrdersPage() {
  return (
    <RequireRole roles={["MANAGER", "ACCOUNTANT"]}>
      <PurchaseOrders />
    </RequireRole>
  );
}

function PurchaseOrders() {
  const router = useRouter();
  const { can } = useAuth();
  const { currentId } = useBranch();
  const [status, setStatus] = useState<Filter>("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<PoList>("/purchase-orders", { status, page, pageSize: 25 });

  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, c) => s + (c ?? 0), 0);
  const tabs = FILTERS.filter((f) => f.value === "" || f.value === status || (counts[f.value] ?? 0) > 0).map((f) => {
    const c = f.value === "" ? all : (counts[f.value] ?? 0);
    return {
      value: f.value,
      label: (
        <span className="inline-flex items-center gap-1.5">
          {f.label}
          {data && (
            <span
              className={cx(
                "num rounded-full px-1.5 text-[11px] font-semibold",
                f.value === "PENDING_APPROVAL" || f.value === "SENT_BACK" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
              )}
            >
              {c}
            </span>
          )}
        </span>
      ),
    };
  });

  const items = data?.items ?? [];
  const totalValue = n(data?.totalValue);

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle="Raise orders with vendors, get them approved, then receive goods against them"
        actions={
          <>
            <Button variant="secondary" icon={<ClipboardCheck className="size-4" />} onClick={() => router.push("/purchase-orders/approvals")}>
              Approvals
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => router.push("/purchase-orders/new")}>
              New PO
            </Button>
          </>
        }
      />

      <Tabs<Filter>
        tabs={tabs}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <Card bodyClassName="p-0">
        {data && (
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{data.total}</span> purchase order{data.total === 1 ? "" : "s"} · total value{" "}
            <span className="num font-medium text-slate-900">{inr(totalValue)}</span> incl. GST
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
                <Th>PO</Th>
                <Th>Vendor</Th>
                <Th right>Value</Th>
                <Th>Approval</Th>
                <Th>Status</Th>
                <Th right>Received</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !items.length ? (
                <EmptyRow colSpan={7}>
                  {status ? (
                    "No purchase orders with this status"
                  ) : (
                    <>
                      No purchase orders yet.{" "}
                      <Link href="/purchase-orders/new" className="font-medium text-brand-700 underline">
                        Raise your first PO
                      </Link>
                    </>
                  )}
                </EmptyRow>
              ) : (
                items.map((po) => {
                  const receivable = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
                  const showReceived = receivable || po.status === "RECEIVED";
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/purchase-orders/${po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                            {po.poNo}
                          </Link>
                          {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
                          {currentId === "all" && po.branch && <BranchCode code={po.branch.code} title={`Deliver to ${po.branch.name}`} />}
                        </div>
                        <p className="text-xs text-slate-500">
                          {date(po.orderDate)}
                          {po.createdBy && ` · ${po.createdBy.name}`}
                        </p>
                      </Td>
                      <Td>
                        <p className="font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
                        {po.itemCount !== undefined && (
                          <p className="text-xs text-slate-500">
                            {po.itemCount} item{po.itemCount === 1 ? "" : "s"}
                          </p>
                        )}
                      </Td>
                      <Td right className="font-medium text-slate-900">
                        {inr(po.totalAmount)}
                      </Td>
                      <Td>
                        <ApprovalChain chain={po.chain} />
                      </Td>
                      <Td>
                        <StatusBadge status={po.status} />
                      </Td>
                      <Td right>
                        {showReceived ? (
                          <div className="ml-auto w-24">
                            <p className="num text-xs font-medium text-slate-700">{po.receivedPct}%</p>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cx("h-full rounded-full", po.receivedPct >= 100 ? "bg-brand-500" : "bg-violet-500")}
                                style={{ width: `${po.receivedPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </Td>
                      <Td right>
                        <div className="flex items-center justify-end gap-1">
                          {receivable && can("MANAGER") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<PackageCheck className="size-4" />}
                              onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}
                            >
                              Receive
                            </Button>
                          )}
                          {po.canEdit && (
                            <Link
                              href={`/purchase-orders/${po.id}/edit`}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit"
                              aria-label={`Edit ${po.poNo}`}
                            >
                              <Pencil className="size-4" />
                            </Link>
                          )}
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="View"
                            aria-label={`View ${po.poNo}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                        </div>
                      </Td>
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
