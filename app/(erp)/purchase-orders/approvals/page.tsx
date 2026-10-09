"use client";

import { RefreshCw, Repeat, Settings2, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApprovalChain } from "@/components/ApprovalChain";
import { Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ApprovalQueue } from "@/lib/types";

const decisionBadge = (action: string) =>
  action.startsWith("Approved") ? (
    <Badge tone="green">Approved</Badge>
  ) : action.startsWith("Rejected") ? (
    <Badge tone="red">Rejected</Badge>
  ) : (
    <Badge tone="amber">Sent back</Badge>
  );

/** "Approved · level 2" → "level 2" */
const levelOf = (action: string) => action.split("·")[1]?.trim();

export default function ApprovalsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<ApprovalQueue>("/purchase-orders/approvals");

  return (
    <>
      <PageHeader
        title="PO approvals"
        subtitle="Purchase orders waiting for a decision, and what was decided recently"
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void reload()} loading={loading && !!data}>
              Refresh
            </Button>
            {can("ADMIN") && (
              <Button variant="secondary" icon={<Settings2 className="size-4" />} onClick={() => router.push("/admin/approval-rules")}>
                Approval rules
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {data.byStep.map((s, i) => (
            <StatCard
              key={i}
              label={`${s.title} · ${s.approverName ?? "any manager"}`}
              value={s.waiting}
              sub={s.waiting === 1 ? "PO waiting" : "POs waiting"}
              icon={<Users />}
              tone={s.waiting ? "amber" : "slate"}
            />
          ))}
          <StatCard label="Re-approvals" value={data.reapprovals} sub="edited or resubmitted POs (round 2+)" icon={<Repeat />} tone="blue" />
          <StatCard
            label="Waiting for you"
            value={data.mine}
            sub={data.mine ? "you can decide these now" : "nothing needs you right now"}
            icon={<UserCheck />}
            tone={data.mine ? "green" : "slate"}
          />
        </div>
      )}

      <Card title="Waiting for a decision" bodyClassName="p-0" className="mb-4">
        <Table>
          <thead>
            <tr>
              <Th>PO</Th>
              <Th>Vendor</Th>
              <Th right>Value</Th>
              <Th>Approval chain</Th>
              <Th>Waiting with</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={6} />
            ) : !data?.pending.length ? (
              <EmptyRow colSpan={6}>No purchase orders are waiting for approval</EmptyRow>
            ) : (
              data.pending.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/purchase-orders/${po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {po.poNo}
                      </Link>
                      {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {date(po.orderDate)}
                      {po.createdBy && ` · ${po.createdBy.name}`}
                    </p>
                  </Td>
                  <Td className="min-w-48">
                    <p className="font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {po._count.items} item{po._count.items === 1 ? "" : "s"}
                      {po.lastAction && ` · ${po.lastAction.action} by ${po.lastAction.userName}`}
                    </p>
                  </Td>
                  <Td right className="font-medium text-slate-900">
                    {inr(po.totalAmount)}
                  </Td>
                  <Td>
                    <ApprovalChain chain={po.chain} />
                  </Td>
                  <Td>
                    {po.waitingFor ? (
                      <>
                        <p className="whitespace-nowrap font-medium text-slate-800">{po.waitingFor.approverName ?? "Any manager"}</p>
                        <p className="text-xs text-slate-500">
                          {po.waitingFor.title} · step {po.level + 1} of {po.chain.length}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td right>
                    <Button size="sm" variant={po.canAct ? "primary" : "secondary"} onClick={() => router.push(`/purchase-orders/${po.id}`)}>
                      {po.canAct ? "Review" : "View"}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Recent decisions" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>PO</Th>
              <Th>Decision</Th>
              <Th>By</Th>
              <Th>Comment</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={5} />
            ) : !data?.decisions.length ? (
              <EmptyRow colSpan={5}>No approval decisions yet</EmptyRow>
            ) : (
              data.decisions.map((d) => (
                <tr key={d.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{dateTime(d.at)}</Td>
                  <Td>
                    <Link href={`/purchase-orders/${d.po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                      {d.po.poNo}
                    </Link>
                    {d.round > 1 && <p className="text-xs text-slate-500">Round {d.round}</p>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {decisionBadge(d.action)}
                      {levelOf(d.action) && <span className="whitespace-nowrap text-xs text-slate-400">{levelOf(d.action)}</span>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{d.userName}</Td>
                  <Td className="text-slate-600">{d.note || <span className="text-slate-300">—</span>}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
