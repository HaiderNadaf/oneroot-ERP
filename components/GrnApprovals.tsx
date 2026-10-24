"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApprovalChain } from "@/components/ApprovalChain";
import { Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, Modal, Table, Td, Textarea, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, inr, qty } from "@/lib/format";
import { clearApiCache } from "@/lib/hooks";
import type { GrnApprovalQueue, GrnApprovalRow } from "@/lib/types";

type Decision = "approve" | "reject";

const received = (r: GrnApprovalRow) => r.items.reduce((s, i) => s + i.passedQty, 0);

/** PO Approvals → Goods Inward tab: goods inward waiting for the L1 → L2 → L3 chain; the last approval posts the GRN */
export function GrnApprovals({
  data,
  error,
  loading,
  reload,
}: {
  data: GrnApprovalQueue | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}) {
  const [deciding, setDeciding] = useState<{
    row: GrnApprovalRow;
    action: Decision;
  } | null>(null);

  return (
    <>
      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}

      <Card title="Goods Inward Waiting for Approval" bodyClassName="p-0" className="mb-4">
        <Table>
          <thead>
            <tr>
              <Th>PO</Th>
              <Th>Vendor</Th>
              <Th>Received</Th>
              <Th right>PO Value</Th>
              <Th className="hidden md:table-cell">Approval Chain</Th>
              <Th>Waiting With</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data?.pending.length ? (
              <EmptyRow colSpan={7}>No goods inward is waiting for approval</EmptyRow>
            ) : (
              data.pending.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/purchase-orders/${r.po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                      {r.po.poNo}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {date(r.receivedAt)} · {r.requestedBy.name}
                    </p>
                  </Td>
                  <Td className="min-w-40">
                    <p className="break-words font-medium text-slate-800">{r.po.vendor.name}</p>
                    {r.supplierInvoiceNo && <p className="text-xs text-slate-500">Invoice {r.supplierInvoiceNo}</p>}
                  </Td>
                  <Td className="min-w-48">
                    <p className="text-sm text-slate-800">
                      {qty(received(r))} in {r.items.length} line
                      {r.items.length === 1 ? "" : "s"}
                    </p>
                    <p className="line-clamp-2 text-xs text-slate-500">
                      {r.items.map((i) => `${i.product} ${qty(i.passedQty)}${i.unit ? ` ${i.unit}` : ""}`).join(", ")}
                    </p>
                  </Td>
                  <Td right className="whitespace-nowrap font-medium text-slate-900">
                    {inr(r.po.totalAmount)}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <ApprovalChain chain={r.chain} />
                  </Td>
                  <Td>
                    {r.waitingFor ? (
                      <>
                        <p className="whitespace-nowrap font-medium text-slate-800">{r.waitingFor.approverName ?? "An approver"}</p>
                        <p className="text-xs text-slate-500">
                          {r.waitingFor.title} · step {r.level + 1} of {r.chain.length}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td right>
                    {r.canAct && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDeciding({ row: r, action: "reject" })}>
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => setDeciding({ row: r, action: "approve" })}>
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
      </Card>

      <Card title="Recent Goods Inward Decisions" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>PO</Th>
              <Th>Decision</Th>
              <Th>By</Th>
              <Th>GRN / Reason</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={5} />
            ) : !data?.decided.length ? (
              <EmptyRow colSpan={5}>No goods inward decisions yet</EmptyRow>
            ) : (
              data.decided.map((r) => {
                const last = r.history[r.history.length - 1];
                return (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{dateTime(last?.at ?? r.updatedAt)}</Td>
                    <Td>
                      <Link href={`/purchase-orders/${r.po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {r.po.poNo}
                      </Link>
                      <p className="text-xs text-slate-500">{r.po.vendor.name}</p>
                    </Td>
                    <Td>{r.status === "APPROVED" ? <Badge tone="green">Approved</Badge> : <Badge tone="red">Rejected</Badge>}</Td>
                    <Td className="whitespace-nowrap">{last?.by ?? "—"}</Td>
                    <Td className="min-w-48 text-slate-600">
                      {r.grn ? (
                        <Link href={`/goods-inward/${r.grn.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.grn.grnNo}
                        </Link>
                      ) : (
                        last?.note || <span className="text-slate-300">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      {deciding && (
        <GrnDecisionModal
          row={deciding.row}
          action={deciding.action}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            clearApiCache("/purchase-orders");
            clearApiCache("/grns");
            reload();
          }}
        />
      )}
    </>
  );
}

function GrnDecisionModal({ row, action, onClose, onDone }: { row: GrnApprovalRow; action: Decision; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const step = row.waitingFor;
  const lastStep = row.level + 1 >= row.chain.length;

  async function submit() {
    if (action === "reject" && !note.trim()) return toast.error("Give a reason for rejecting");
    setSaving(true);
    try {
      const res = await api.post<{ status: string; grn?: { grnNo: string } }>(`/purchase-orders/approvals/grn/${row.id}/decision`, {
        action,
        note: note.trim() || undefined,
      });
      toast.success(
        action === "reject"
          ? `Goods inward on ${row.po.poNo} rejected`
          : res.grn
            ? `Approved · ${res.grn.grnNo} posted and stock updated`
            : `Approved and passed to ${row.chain[row.level + 1]?.title ?? "the next step"}`,
      );
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${action === "approve" ? "Approve" : "Reject"} goods inward · ${row.po.poNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === "approve" ? "primary" : "danger"}
            icon={action === "approve" ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            onClick={submit}
            loading={saving}
          >
            {action === "reject" ? "Reject" : lastStep ? "Approve & Post GRN" : "Approve"}
          </Button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Vendor</p>
          <p className="break-words font-medium text-slate-800">{row.po.vendor.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">PO Value</p>
          <p className="num font-medium text-slate-800">{inr(row.po.totalAmount)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-slate-500">Received by {row.requestedBy.name}</p>
          <ul className="mt-0.5 space-y-0.5 text-slate-800">
            {row.items.map((i, k) => (
              <li key={k}>
                {i.product}: <span className="num font-medium">{qty(i.passedQty)}</span> {i.unit}
                {i.batchNo && <span className="text-xs text-slate-500"> · batch {i.batchNo}</span>}
              </li>
            ))}
          </ul>
        </div>
        {step && (
          <div className="col-span-2">
            <p className="text-xs text-slate-500">Deciding for</p>
            <p className="font-medium text-slate-800">
              Step {row.level + 1} of {row.chain.length}: {step.title}
            </p>
          </div>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {action === "reject"
          ? "Nothing is posted; the receiver is told why and can enter the goods inward again."
          : lastStep
            ? "This is the last approval: the GRN is posted, stock is updated and the purchase invoice is booked."
            : "The goods inward moves on to the next level. Nothing is posted until the last approval."}
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {action === "reject" ? (
            <>
              Reason<span className="text-red-500"> *</span>
            </>
          ) : (
            "Comment (optional)"
          )}
        </span>
        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={action === "reject" ? "Why is this goods inward rejected?" : "Anything the next approver should know"}
        />
      </label>
    </Modal>
  );
}
