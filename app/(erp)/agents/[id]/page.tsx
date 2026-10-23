"use client";

import { ArrowLeft, Download, IndianRupee, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, DateInput, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, Select, Spinner, StatCard, StatusBadge, Table, Td, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, n, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Agent, AgentSale, Dec, Paged } from "@/lib/types";

type AgentSales = Paged<AgentSale> & { agent: Agent; totalAmount: Dec; paidAmount: Dec };

/** One agent's sales: the total billed under the agent and every bill, between two dates */
export default function AgentSalesPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();
  // The agents list hands over its date range
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const filters = { from, to, status };
  const { data, error, loading, reload } = useApi<AgentSales>(`/agents/${id}/sales`, { ...filters, page, pageSize: 25 });
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner page />;
  if (!data) return null;

  const a = data.agent;
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
  const total = n(data.totalAmount);
  const due = round2(total - n(data.paidAmount));
  const cancelled = status === "CANCELLED";
  const linkBills = can("sales.view");

  async function exportCsv() {
    setExporting(true);
    try {
      // The API sends at most 500 bills a page: fetch every page
      const rows: AgentSale[] = [];
      for (let p = 1; ; p++) {
        const r = await api.get<AgentSales>(`/agents/${id}/sales`, { ...filters, page: p, pageSize: 500 });
        rows.push(...r.items);
        if (p >= r.totalPages) break;
      }
      downloadCsv(
        `agent-sales_${a.agentId}_${from || "all"}_${to || "all"}.csv`,
        ["Invoice No", "Date", "Customer", "Phone", "Branch", "Items", "Total", "Paid", "Due", "Payment", "Status"],
        rows.map((s) => [
          s.invoiceNo,
          date(s.saleDate),
          s.customer?.name ?? s.customerName ?? "Walk-in",
          s.customer?.phone ?? "",
          s.branch?.name ?? "",
          s._count?.items ?? "",
          n(s.totalAmount),
          n(s.paidAmount),
          round2(n(s.totalAmount) - n(s.paidAmount)),
          s.paymentMode,
          s.status === "CANCELLED" ? "Cancelled" : s.paymentStatus,
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Agents
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {name}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-600">{a.agentId}</span>
            {a.deletedAt && <Badge>Deleted</Badge>}
          </span>
        }
        subtitle={[a.mobile, a.branch && `${a.branch.name} (${a.branch.code})`].filter(Boolean).join(" · ") || "Agent"}
        actions={
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => void exportCsv()} loading={exporting} disabled={!data.total}>
            CSV
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={cancelled ? "Cancelled Bills Value" : status === "all" ? "All Bills Value" : "Total Sales"}
          value={inr(total)}
          icon={<IndianRupee />}
          tone={cancelled ? "red" : "green"}
          sub={from || to ? `${from ? date(from) : "Start"} – ${to ? date(to) : "today"}` : "All time"}
        />
        <StatCard label="Bills" value={data.total} icon={<ReceiptText />} tone="blue" sub={total && data.total ? `Avg ${inr(round2(total / data.total))} per bill` : undefined} />
        <StatCard label="Still Due" value={inr(due)} icon={<Wallet />} tone={due > 0 ? "amber" : "slate"} sub={`${inr(data.paidAmount)} collected`} />
      </div>

      <Card bodyClassName="p-0" title="Sales Transactions">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <DateInput value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
            <span className="text-xs text-slate-400">to</span>
            <DateInput value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
          </div>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="Bill status">
            <option value="">Completed Bills</option>
            <option value="CANCELLED">Cancelled Bills</option>
            <option value="all">All Bills</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice No.</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Branch</Th>
                <Th right>Items</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th right>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data.items.length ? (
                <LoadingRow colSpan={9} />
              ) : !data.items.length ? (
                <EmptyRow colSpan={9}>No bills under this agent{from || to ? " between these dates" : " yet"}</EmptyRow>
              ) : (
                data.items.map((s) => {
                  const rowDue = s.status === "COMPLETED" ? round2(n(s.totalAmount) - n(s.paidAmount)) : 0;
                  return (
                    <tr key={s.id} className={cx("hover:bg-slate-50", s.status === "CANCELLED" && "opacity-60")}>
                      <Td className="whitespace-nowrap font-medium text-slate-900">
                        {linkBills ? (
                          <Link href={`/sales/${s.id}`} className="hover:text-brand-700 hover:underline">
                            {s.invoiceNo}
                          </Link>
                        ) : (
                          s.invoiceNo
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{date(s.saleDate)}</Td>
                      <Td>
                        <p className="text-slate-900">{s.customer?.name ?? s.customerName ?? "Walk-in"}</p>
                        {s.customer?.phone && <p className="text-xs text-slate-500">{s.customer.phone}</p>}
                      </Td>
                      <Td className="text-slate-600">{s.branch?.name ?? "—"}</Td>
                      <Td right className="num text-slate-600">
                        {s._count?.items ?? "—"}
                      </Td>
                      <Td right className="num whitespace-nowrap font-semibold text-slate-900">
                        {inr(s.totalAmount)}
                      </Td>
                      <Td right className="num whitespace-nowrap text-slate-500">
                        {inr(s.paidAmount)}
                      </Td>
                      <Td right className={cx("num whitespace-nowrap", rowDue > 0 ? "font-medium text-amber-700" : "text-slate-400")}>
                        {inr(rowDue)}
                      </Td>
                      <Td>{s.status === "CANCELLED" ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={s.paymentStatus} />}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data.items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={5} className="text-right text-xs uppercase tracking-wide text-slate-500">
                    Total · {data.total} bill{data.total === 1 ? "" : "s"}
                  </Td>
                  <Td right className="num whitespace-nowrap text-slate-900">
                    {inr(total)}
                  </Td>
                  <Td right className="num whitespace-nowrap text-slate-600">
                    {inr(data.paidAmount)}
                  </Td>
                  <Td right className={cx("num whitespace-nowrap", due > 0 ? "text-amber-700" : "text-slate-400")}>
                    {inr(due)}
                  </Td>
                  <Td />
                </tr>
              </tfoot>
            )}
          </Table>
        )}
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      </Card>
    </>
  );
}
