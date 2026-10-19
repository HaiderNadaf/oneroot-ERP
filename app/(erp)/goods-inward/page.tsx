"use client";

import { AlertTriangle, FileText, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode } from "@/components/BranchNotice";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
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
import { date, daysUntil, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Grn, Paged, PendingInwardPo, StoreSettings } from "@/lib/types";

type Filter = "all" | "false" | "true";

export default function GoodsInwardPage() {
  return (
    <RequirePerm perms={["purchases.view"]}>
      <GoodsInward />
    </RequirePerm>
  );
}

function GoodsInward() {
  const router = useRouter();
  const { can } = useAuth();
  const canReceive = can("purchases.receive");
  const canInvoice = can("purchases.manage");
  const canVendors = can("vendors.view");
  // With "All branches" selected, tag each PO / GRN with the branch it belongs to
  const { currentId, branches } = useBranch();
  const showBranch = currentId === "all";
  const branchOf = (id?: string | null) => branches.find((b) => b.id === id);
  const [filter, setFilter] = useState<Filter>("all");

  const pending = useApi<PendingInwardPo[]>("/grns/pending");
  const [page, setPage] = useState(1);
  // FEFO (first expiry, first out): GRNs whose accepted stock expires first come first
  const [sort, setSort] = useState<"fefo" | "latest">("fefo");
  const grns = useApi<Paged<Grn>>("/grns", { invoiced: filter === "all" ? undefined : filter, sort: sort === "fefo" ? "fefo" : undefined, page, pageSize: 25 });
  const { data: settings } = useApi<StoreSettings>("/settings");
  const alertDays = settings?.expiryAlertDays ?? 60;
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
        className="mb-4"
        bodyClassName="p-0"
        title={
          <span className="flex items-center gap-2">
            <Truck className="size-4 text-slate-400" /> Approved POs waiting for goods
            {pending.data && <Badge tone="blue">{pending.data.length}</Badge>}
          </span>
        }
      >
        {pending.error ? (
          <div className="p-4">
            <ErrorBox message={pending.error} onRetry={pending.reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Vendor</Th>
                <Th className="hidden md:table-cell">Products</Th>
                <Th>Expected</Th>
                <Th className="min-w-36">Received</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pending.loading && !pending.data ? (
                <LoadingRow colSpan={6} />
              ) : !pending.data?.length ? (
                <EmptyRow colSpan={6}>No approved purchase orders are waiting for goods.</EmptyRow>
              ) : (
                pending.data.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/purchase-orders/${po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {po.poNo}
                      </Link>
                      {showBranch && po.branch && (
                        <span className="ml-1.5">
                          <BranchCode code={po.branch.code} title={`Deliver to ${po.branch.name}`} />
                        </span>
                      )}
                      <p className="text-xs text-slate-500">Ordered {date(po.orderDate)}</p>
                    </Td>
                    <Td className="min-w-36">
                      {canVendors ? (
                        <Link href={`/vendors/${po.vendor.id}`} className="hover:text-brand-700">
                          {po.vendor.name}
                        </Link>
                      ) : (
                        po.vendor.name
                      )}
                    </Td>
                    <Td className="hidden max-w-80 md:table-cell">
                      <p className="truncate text-slate-700" title={po.products.join(", ")}>
                        {po.products.slice(0, 3).join(", ")}
                      </p>
                      {po.products.length > 3 && <p className="text-xs text-slate-500">+{po.products.length - 3} more</p>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {po.expectedDate ? date(po.expectedDate) : <span className="text-slate-400">—</span>}
                      {po.late && (
                        <span className="ml-1.5">
                          <Badge tone="red">Late</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cx("h-full rounded-full", po.receivedPct > 0 ? "bg-violet-500" : "bg-slate-300")}
                            style={{ width: `${po.receivedPct}%` }}
                          />
                        </div>
                        <span className="num text-xs text-slate-600">{po.receivedPct}%</span>
                      </div>
                      {po.status === "PARTIALLY_RECEIVED" && <p className="mt-0.5 text-xs text-violet-700">Balance open</p>}
                    </Td>
                    <Td right>
                      {canReceive && (
                        <Button size="sm" icon={<PackageCheck className="size-4" />} onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}>
                          Receive
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

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
                ["fefo", "First Expiry First (FEFO)"],
                ["latest", "Latest Received"],
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
                <Th>Earliest Expiry</Th>
                <Th className="hidden md:table-cell">Received By</Th>
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
                <LoadingRow colSpan={12} />
              ) : !grns.data?.items.length ? (
                <EmptyRow colSpan={12}>
                  {filter === "false" ? "Every GRN has its purchase invoice booked." : "No goods received yet."}
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
                    <Td className="whitespace-nowrap">
                      <ExpiryCell d={g.earliestExpiry} alertDays={alertDays} />
                    </Td>
                    <Td className="hidden text-slate-600 md:table-cell">{g.receivedBy?.name ?? "—"}</Td>
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
    </>
  );
}

/** Earliest expiry of a GRN's accepted stock, with how long is left */
function ExpiryCell({ d, alertDays }: { d?: string | null; alertDays: number }) {
  if (!d) return <span className="text-slate-400">—</span>;
  const left = daysUntil(d) ?? 0;
  return (
    <span className="inline-flex flex-col">
      <span className="text-slate-800">{date(d)}</span>
      {left < 0 ? (
        <Badge tone="red">Expired</Badge>
      ) : (
        <span className={cx("text-xs", left <= alertDays ? "font-medium text-amber-700" : "text-slate-500")}>{left === 0 ? "Expires today" : `${left} day${left === 1 ? "" : "s"} left`}</span>
      )}
    </span>
  );
}

function Qty({ v, tone }: { v?: number; tone: string }) {
  return (
    <Td right className={cx("hidden md:table-cell", v ? cx("font-medium", tone) : "text-slate-400")}>
      {v ? qty(v) : "—"}
    </Td>
  );
}
