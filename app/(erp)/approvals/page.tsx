"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyRow, ErrorBox, Input, LoadingRow, Modal, PageHeader, Pagination, Select, StatCard, Table, Td, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ApprovalKind, ApprovalRequest, Paged } from "@/lib/types";

const KIND: Record<ApprovalKind, string> = { DISCOUNT: "Discount", RETURN: "Return / refund", ADJUSTMENT: "Stock adjustment", OTHER: "Override" };
const amountOf = (r: ApprovalRequest) => (r.kind === "DISCOUNT" ? `${Number(r.amount)}%` : inr(r.amount));

export default function ApprovalsPage() {
  const toast = useToast();
  const { can } = useAuth();
  const manager = can("approvals.decide");
  const [status, setStatus] = useState(manager ? "PENDING" : "");
  const [mine, setMine] = useState(!manager);
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState<{ r: ApprovalRequest; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useApi<Paged<ApprovalRequest> & { pending: number }>("/approvals", { status, mine: mine ? "true" : undefined, page, pageSize: 25 });

  // The inbox refreshes itself while open
  useEffect(() => {
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [reload]);

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    try {
      await api.post(`/approvals/${deciding.r.id}/decide`, { action: deciding.action, note: note.trim() || undefined });
      toast.success(deciding.action === "approve" ? "Approved" : "Rejected");
      setDeciding(null);
      setNote("");
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const details = (r: ApprovalRequest) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (d.customer) parts.push(String(d.customer));
    if (d.invoiceNo) parts.push(String(d.invoiceNo));
    if (d.product) parts.push(`${d.product}${d.quantity ? ` × ${d.quantity}` : ""}`);
    if (d.total) parts.push(`bill ${inr(d.total as number)}`);
    if (d.refundMode) parts.push(`refund ${String(d.refundMode).toLowerCase()}`);
    return parts.join(" · ");
  };

  return (
    <>
      <PageHeader
        title={manager ? "Approvals inbox" : "My approval requests"}
        subtitle={manager ? "Overrides above a cashier's limit: discounts, cash refunds and stock adjustments wait here until you decide" : "Requests you sent to a manager and what they decided"}
      />
      {manager && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Waiting for you" value={data?.pending ?? 0} tone={(data?.pending ?? 0) > 0 ? "amber" : "green"} />
        </div>
      )}
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-40" aria-label="Status">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="USED">Used</option>
            <option value="REJECTED">Rejected</option>
          </Select>
          {manager && (
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={mine} onChange={(e) => (setMine(e.target.checked), setPage(1))} /> Only my requests
            </label>
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
                <Th>When</Th>
                <Th>Who asks</Th>
                <Th>For</Th>
                <Th right>Amount</Th>
                <Th>Details / reason</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={7}>{status === "PENDING" ? "Nothing waiting" : "No requests"}</EmptyRow>
              ) : (
                data.items.map((r) => (
                  <tr key={r.id} className={cx("hover:bg-slate-50", r.status === "PENDING" && "bg-amber-50/40")}>
                    <Td className="whitespace-nowrap text-xs">{dateTime(r.createdAt)}</Td>
                    <Td>
                      <span className="font-medium text-slate-900">{r.requestedBy?.name}</span>
                      {r.branch && <span className="ml-1 text-xs text-slate-400">{r.branch.code}</span>}
                    </Td>
                    <Td>{KIND[r.kind]}</Td>
                    <Td right className="font-semibold">{amountOf(r)}</Td>
                    <Td className="max-w-md text-xs text-slate-600">
                      {details(r)}
                      {r.reason && <p className="italic text-slate-500">“{r.reason}”</p>}
                      {r.note && <p className="text-slate-500">Manager: {r.note}</p>}
                    </Td>
                    <Td>
                      {r.status === "PENDING" ? (
                        <Badge tone="amber">Pending</Badge>
                      ) : r.status === "REJECTED" ? (
                        <Badge tone="red">Rejected · {r.decidedBy?.name}</Badge>
                      ) : (
                        <Badge tone="green">
                          {r.status === "USED" ? "Used" : "Approved"} · {r.decidedBy?.name}
                          {r.byPin ? " (PIN)" : ""}
                        </Badge>
                      )}
                    </Td>
                    <Td right>
                      {manager && r.status === "PENDING" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => setDeciding({ r, action: "reject" })}>
                            Reject
                          </Button>
                          <Button size="sm" icon={<Check className="size-4" />} onClick={() => setDeciding({ r, action: "approve" })}>
                            Approve
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding ? `${deciding.action === "approve" ? "Approve" : "Reject"} · ${KIND[deciding.r.kind]} ${amountOf(deciding.r)}` : ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button variant={deciding?.action === "reject" ? "danger" : "primary"} loading={busy} onClick={decide}>
              {deciding?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              {deciding.r.requestedBy?.name} asks for a {KIND[deciding.r.kind].toLowerCase()} of <b>{amountOf(deciding.r)}</b>
              {details(deciding.r) ? ` (${details(deciding.r)})` : ""}.
            </p>
            {deciding.r.reason && <p className="italic text-slate-500">“{deciding.r.reason}”</p>}
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the cashier (optional)" />
          </div>
        )}
      </Modal>
    </>
  );
}
