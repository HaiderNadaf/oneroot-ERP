"use client";

import { AlertTriangle, FileText, PackageCheck, Plus /* , Truck */ } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode } from "@/components/BranchNotice";
import { ListFilters, hasListFilters, noListFilters } from "@/components/ListFilters";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  Table,
  Tabs,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, /* daysUntil, */ qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Grn, Paged, PendingInwardPo /* , StoreSettings */ } from "@/lib/types";

type Filter = "all" | "false" | "true";

export default function GoodsInwardPage() {
  return (
    <RequirePerm perms={["grn.view", "purchases.receive"]}>
      <GoodsInward />
    </RequirePerm>
  );
}

function GoodsInward() {
  const router = useRouter();
  const { can } = useAuth();
  const canReceive = can("purchases.receive");
  const canInvoice = can("invoices.create");
  const canVendors = can("vendors.view");
  // With "All branches" selected, tag each PO / GRN with the branch it belongs to
  const { currentId, branches } = useBranch();
  const showBranch = currentId === "all";
  const branchOf = (id?: string | null) => branches.find((b) => b.id === id);
  const [filter, setFilter] = useState<Filter>("all");

  const [picking, setPicking] = useState(false);
  const [page, setPage] = useState(1);
  // Newest first; FEFO (first expiry, first out) puts the GRNs whose accepted stock expires first on top
  const [sort, setSort] = useState<"fefo" | "latest">("latest");
  const [filters, setFilters] = useState(noListFilters);
  const grns = useApi<Paged<Grn>>("/grns", { ...filters, invoiced: filter === "all" ? undefined : filter, sort: sort === "fefo" ? "fefo" : undefined, page, pageSize: 25 });
  // Only the Expiry column used these, and it is commented out below
  // const { data: settings } = useApi<StoreSettings>("/settings");
  // const alertDays = settings?.expiryAlertDays ?? 60;
  // Always fetched so the banner and tab count stay visible on every tab
  // Banner: the first few GRNs without an invoice, plus how many there are in total
  const uninvoiced = useApi<Paged<Grn>>("/grns", { invoiced: "false", pageSize: 6 });
  const waiting = uninvoiced.data?.items ?? [];
  const waitingTotal = uninvoiced.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Goods Inward"
        subtitle="Count what arrives against approved purchase orders: passed goods go into stock, rejected goods go back to the vendor"
        actions={
          canReceive && (
            <Button icon={<Plus className="size-4" />} onClick={() => setPicking(true)}>
              Add GRN
            </Button>
          )
        }
      />

      {waitingTotal > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 sm:px-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {waitingTotal} GRN{waitingTotal === 1 ? "" : "s"} received but not yet invoiced
            </p>
            <p className="mt-0.5 text-amber-700">
              {waiting.slice(0, 6).map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ", "}
                  <Link href={`/goods-inward/${g.id}`} className="font-medium underline-offset-2 hover:underline">
                    {g.grnNo}
                  </Link>{" "}
                  ({g.vendor.name})
                </span>
              ))}
              {waitingTotal > waiting.length && ` and ${waitingTotal - waiting.length} more`}. Book the vendor&apos;s bill so the payable is recorded.
            </p>
          </div>
        </div>
      )}

      <Card
        bodyClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            <PackageCheck className="size-4 text-slate-400" /> Posted GRNs
          </span>
        }
        actions={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Order GRNs by">
            {(
              [
                ["latest", "Latest"],
                ["fefo", "First Expiry First (FEFO)"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={sort === k}
                onClick={() => {
                  setSort(k);
                  setPage(1);
                }}
                className={cx("rounded-md px-2.5 py-1 text-xs font-medium", sort === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="px-3 pt-2">
          <Tabs<Filter>
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            tabs={[
              { value: "all", label: "All" },
              {
                value: "false",
                label: (
                  <span className="flex items-center gap-1.5">
                    Invoice pending {waitingTotal > 0 && <Badge tone="amber">{waitingTotal}</Badge>}
                  </span>
                ),
              },
              { value: "true", label: "Invoiced" },
            ]}
          />
        </div>
        <div className="border-b border-slate-100 px-3 pb-3">
          <ListFilters
            value={filters}
            optionsPath="/grns/filters"
            userLabel="Received By"
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
          />
        </div>
        {grns.error ? (
          <div className="p-4">
            <ErrorBox message={grns.error} onRetry={grns.reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>GRN</Th>
                <Th>PO</Th>
                <Th>Vendor</Th>
                {/* <Th>Earliest Expiry</Th> */}
                <Th className="hidden md:table-cell">Received By</Th>
                <Th right>PO Qty</Th>
                <Th right>Received</Th>
                <Th right>Passed</Th>
                <Th right className="hidden md:table-cell">Rejected</Th>
                <Th right className="hidden md:table-cell">Damaged</Th>
                <Th right className="hidden md:table-cell">Expired</Th>
                <Th>Finance</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {grns.loading && !grns.data ? (
                <LoadingRow colSpan={13} />
              ) : !grns.data?.items.length ? (
                <EmptyRow colSpan={13}>
                  {hasListFilters(filters)
                    ? "No GRNs match these filters."
                    : filter === "false"
                      ? "Every GRN has its purchase invoice booked."
                      : "No goods received yet."}
                </EmptyRow>
              ) : (
                grns.data.items.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/goods-inward/${g.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {g.grnNo}
                      </Link>
                      {showBranch && branchOf(g.branchId) && (
                        <span className="ml-1.5">
                          <BranchCode code={branchOf(g.branchId)!.code} title={`Received into ${branchOf(g.branchId)!.name}`} />
                        </span>
                      )}
                      <p className="text-xs text-slate-500">{date(g.receivedAt)}</p>
                      {g.supplierInvoiceNo && <p className="text-xs text-slate-500">Inv. {g.supplierInvoiceNo}</p>}
                    </Td>
                    <Td>
                      <Link href={`/purchase-orders/${g.po.id}`} className="whitespace-nowrap text-brand-700 hover:underline">
                        {g.po.poNo}
                      </Link>
                    </Td>
                    <Td className="min-w-36">
                      {canVendors ? (
                        <Link href={`/vendors/${g.vendor.id}`} className="hover:text-brand-700">
                          {g.vendor.name}
                        </Link>
                      ) : (
                        g.vendor.name
                      )}
                    </Td>
                    {/* <Td className="whitespace-nowrap">
                      <ExpiryCell d={g.earliestExpiry} alertDays={alertDays} />
                    </Td> (ExpiryCell and alertDays are commented out too) */}
                    <Td className="hidden text-slate-600 md:table-cell">{g.receivedBy?.name ?? "—"}</Td>
                    <Td right className="text-slate-700">
                      {g.poQty !== undefined ? qty(g.poQty) : "—"}
                    </Td>
                    <Td right className="font-semibold text-slate-900">
                      {qty(g.received)}
                    </Td>
                    <Td right className="font-semibold text-brand-700">
                      {qty(g.passed)}
                    </Td>
                    <Qty v={g.rejected} tone="text-red-600" />
                    <Qty v={g.damaged} tone="text-amber-700" />
                    <Qty v={g.expired} tone="text-amber-700" />
                    <Td>
                      {g.purchase ? (
                        <Link href={`/purchases/${g.purchase.id}`} className="inline-flex flex-col">
                          <Badge tone="green">Invoiced</Badge>
                          <span className="mt-0.5 text-xs text-brand-700 hover:underline">{g.purchase.purchaseNo}</span>
                        </Link>
                      ) : (
                        <Badge tone="amber">Invoice Pending</Badge>
                      )}
                    </Td>
                    <Td right>
                      {!g.purchase && canInvoice && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<FileText className="size-4" />}
                          onClick={() => router.push(`/goods-inward/${g.id}/invoice`)}
                        >
                          Book Invoice
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
        {grns.data && <Pagination page={grns.data.page} totalPages={grns.data.totalPages} total={grns.data.total} onPage={setPage} />}
      </Card>
      {picking && <PendingPosModal onClose={() => setPicking(false)} />}
    </>
  );
}

/** "Add GRN" popup: approved POs with goods still due; picking one opens the receive form */
function PendingPosModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const canVendors = can("vendors.view");
  const { currentId } = useBranch();
  const showBranch = currentId === "all";
  const pending = useApi<PendingInwardPo[]>("/grns/pending");

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      centered
      className="sm:-translate-y-[6vh]"
      title={
        <span className="flex items-center gap-2">
          Approved POs waiting for goods
          {pending.data && <Badge tone="blue">{pending.data.length}</Badge>}
        </span>
      }
    >
      <div className="-mx-4 -my-4 sm:-mx-5">
        {pending.error ? (
          <div className="p-4">
            <ErrorBox message={pending.error} onRetry={pending.reload} />
          </div>
        ) : (
          <Table className="[&>table]:table-fixed">
            <thead>
              <tr>
                <Th className="w-40 pl-4 sm:pl-5">PO</Th>
                <Th className="w-44">Vendor</Th>
                <Th className="hidden md:table-cell">Products</Th>
                <Th className="w-28">Expected</Th>
                <Th right className="w-24">
                  PO Qty
                </Th>
                <Th className="w-36">Received</Th>
                <Th className="w-32 pr-4 sm:pr-5" />
              </tr>
            </thead>
            <tbody>
              {pending.loading && !pending.data ? (
                <LoadingRow colSpan={7} />
              ) : !pending.data?.length ? (
                <EmptyRow colSpan={7}>No approved purchase orders are waiting for goods.</EmptyRow>
              ) : (
                pending.data.map((po) => (
                  <tr key={po.id} className="align-middle hover:bg-slate-50">
                    <Td className="pl-4 sm:pl-5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-slate-900" title={po.poNo}>
                          {po.poNo}
                        </span>
                        {showBranch && po.branch && <BranchCode code={po.branch.code} title={`Deliver to ${po.branch.name}`} />}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">Ordered {date(po.orderDate)}</p>
                    </Td>
                    <Td>
                      <p className="truncate font-medium text-slate-800" title={po.vendor.name}>
                        {canVendors ? (
                          <Link href={`/vendors/${po.vendor.id}`} className="hover:text-brand-700">
                            {po.vendor.name}
                          </Link>
                        ) : (
                          po.vendor.name
                        )}
                      </p>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <p className="truncate text-slate-700" title={po.products.join(", ")}>
                        {po.products.join(", ")}
                      </p>
                      {po.products.length > 1 && <p className="mt-0.5 truncate text-xs text-slate-500">{po.products.length} products</p>}
                    </Td>
                    <Td>
                      <p className="truncate">{po.expectedDate ? date(po.expectedDate) : <span className="text-slate-400">—</span>}</p>
                      {po.late && (
                        <div className="mt-0.5">
                          <Badge tone="red">Late</Badge>
                        </div>
                      )}
                    </Td>
                    <Td right className="num truncate font-medium text-slate-800">
                      {qty(po.poQty)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cx("h-full rounded-full", po.receivedPct > 0 ? "bg-violet-500" : "bg-slate-300")}
                            style={{ width: `${po.receivedPct}%` }}
                          />
                        </div>
                        <span className="num w-9 shrink-0 text-right text-xs text-slate-600">{po.receivedPct}%</span>
                      </div>
                      {po.status === "PARTIALLY_RECEIVED" && <p className="mt-0.5 truncate text-xs text-violet-700">Balance open</p>}
                    </Td>
                    <Td right className="whitespace-nowrap pr-4 sm:pr-5">
                      <Button
                        size="sm"
                        className="whitespace-nowrap"
                        icon={<PackageCheck className="size-4 shrink-0" />}
                        onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}
                      >
                        Add GRN
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </div>
    </Modal>
  );
}

// Used only by the Expiry column, which is commented out in the GRN list
// /** Earliest expiry of a GRN's accepted stock, with how long is left */
// function ExpiryCell({ d, alertDays }: { d?: string | null; alertDays: number }) {
//   if (!d) return <span className="text-slate-400">—</span>;
//   const left = daysUntil(d) ?? 0;
//   return (
//     <span className="inline-flex flex-col">
//       <span className="text-slate-800">{date(d)}</span>
//       {left < 0 ? (
//         <Badge tone="red">Expired</Badge>
//       ) : (
//         <span className={cx("text-xs", left <= alertDays ? "font-medium text-amber-700" : "text-slate-500")}>{left === 0 ? "Expires today" : `${left} day${left === 1 ? "" : "s"} left`}</span>
//       )}
//     </span>
//   );
// }

function Qty({ v, tone }: { v?: number; tone: string }) {
  return (
    <Td right className={cx("hidden md:table-cell", v ? cx("font-medium", tone) : "text-slate-400")}>
      {v ? qty(v) : "—"}
    </Td>
  );
}
