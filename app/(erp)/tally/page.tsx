"use client";

import { ChevronDown, ChevronRight, CloudDownload, Search } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { RangeBar, type Range } from "@/components/reports/ReportKit";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyRow,
  ErrorBox,
  Input,
  LoadingRow,
  PageHeader,
  Pagination,
  Select,
  Table,
  Td,
  Th,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, inr, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged } from "@/lib/types";

interface ReadStatus {
  company: string | null;
  from: string;
  requestedAt: string | null;
  pulledAt: string | null;
  error: string | null;
  pending: boolean;
  reading: boolean;
  agentSeenAt: string | null;
  agentOnline: boolean;
}

interface TallyVoucher {
  id: string;
  guid: string;
  date: string;
  vchType: string;
  vchNo: string | null;
  party: string | null;
  narration: string | null;
  reference: string | null;
  amount: number;
  cancelled: boolean;
  optional: boolean;
  ledgers: { ledger: string; amount: number }[];
  fromErp: boolean;
}

type VoucherList = Paged<TallyVoucher> & { types: { type: string; count: number; amount: number }[] };

/** Financial year to date (1 April onwards) */
function fyRange(): Range {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: today(new Date(y, 3, 1)), to: today() };
}

export default function TallyPage() {
  return (
    <RequirePerm perms={["accounts.view"]}>
      <Tally />
    </RequirePerm>
  );
}

function Tally() {
  const toast = useToast();
  const [range, setRange] = useState<Range>(fyRange);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [company, setCompany] = useState("ENP INPUT STORE");
  const [asking, setAsking] = useState(false);
  const q = useDebounced(search);
  const st = useApi<ReadStatus>("/tally/status");
  const list = useApi<VoucherList>("/tally/vouchers", { ...range, type, search: q, cancelled: cancelled ? "true" : "", page, pageSize: 50 });
  const s = st.data;
  const waiting = !!s?.pending;
  const { reload: reloadStatus } = st;
  const { reload: reloadList } = list;

  // While a read is on its way, check every 5 s and show the vouchers as soon as they land
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(reloadStatus, 5000);
    return () => clearInterval(t);
  }, [waiting, reloadStatus]);
  const pulledAt = s?.pulledAt ?? null;
  useEffect(() => {
    if (pulledAt) reloadList();
  }, [pulledAt, reloadList]);

  async function fetchNow() {
    setAsking(true);
    try {
      await api.post("/tally/refresh", { from: range.from, ...(s?.company ? {} : { company: company.trim() }) });
      toast.success("Asked Tally for its vouchers — they appear here within a minute while Tally is open");
      reloadStatus();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setAsking(false);
    }
  }

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={`Tally${s?.company ? ` · ${s.company}` : ""}`}
        subtitle="Every voucher in Tally Prime — including entries made by hand in Tally — read back through the agent on the Tally server"
        actions={
          <Button icon={<CloudDownload className="size-4" />} loading={asking || waiting} loadingText={waiting ? (s?.reading ? "Reading Tally…" : "Waiting for agent…") : "Asking…"} onClick={fetchNow}>
            Fetch from Tally
          </Button>
        }
      />

      {st.error ? (
        <ErrorBox message={st.error} onRetry={st.reload} />
      ) : (
        s && (
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {s.company ? (
                <span>
                  <span className="text-slate-500">Company </span>
                  <b>{s.company}</b>
                </span>
              ) : (
                <label className="flex items-center gap-2">
                  <span className="text-slate-500">Tally company</span>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} className="w-56" />
                </label>
              )}
              <span>
                <span className="text-slate-500">Last read </span>
                {s.pulledAt ? dateTime(s.pulledAt) : "never"}
              </span>
              <span>
                <span className="text-slate-500">Agent </span>
                {s.agentOnline ? <Badge tone="green">Online</Badge> : <Badge tone="red">Not seen</Badge>}
              </span>
            </div>
            {s.error && <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">Tally said: {s.error}</p>}
            {waiting && !s.agentOnline && (
              <p className="mt-2 text-xs text-amber-700">
                The agent on the Tally server hasn&apos;t called in recently. The read happens once Tally Prime is open there and the agent is running.
              </p>
            )}
          </Card>
        )
      )}

      {list.data && list.data.types.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {list.data.types.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => reset(setType)(type === t.type ? "" : t.type)}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${type === t.type ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-surface hover:bg-slate-50"}`}
            >
              <span className="block text-slate-500">
                {t.type} · {t.count}
              </span>
              <span className="num text-sm font-semibold text-slate-800">{inr(t.amount)}</span>
            </button>
          ))}
        </div>
      )}

      <Card
        title="Vouchers in Tally"
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RangeBar value={range} onChange={reset(setRange)} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input value={search} onChange={(e) => reset(setSearch)(e.target.value)} placeholder="No., party, narration" className="w-52 pl-8" />
            </div>
            <Select value={type} onChange={(e) => reset(setType)(e.target.value)} aria-label="Voucher type">
              <option value="">All types</option>
              {list.data?.types.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type}
                </option>
              ))}
            </Select>
            <Checkbox checked={cancelled} onChange={reset(setCancelled)} label="Show cancelled" />
          </div>
        }
      >
        {list.error ? (
          <ErrorBox message={list.error} onRetry={list.reload} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8" />
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Voucher No.</Th>
                  <Th>Party</Th>
                  <Th right>Amount</Th>
                  <Th>Narration</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {list.loading ? (
                  <LoadingRow colSpan={8} />
                ) : !list.data?.items.length ? (
                  <EmptyRow colSpan={8}>{s?.pulledAt ? "No vouchers in Tally for this period" : "Nothing read from Tally yet — press Fetch from Tally"}</EmptyRow>
                ) : (
                  list.data.items.map((v) => (
                    <Fragment key={v.id}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === v.id ? null : v.id)}>
                        <Td className="text-slate-400">{open === v.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Td>
                        <Td className="whitespace-nowrap">{date(v.date)}</Td>
                        <Td>
                          {v.vchType}
                          {v.cancelled && (
                            <span className="ml-1.5">
                              <Badge tone="red">Cancelled</Badge>
                            </span>
                          )}
                          {v.optional && (
                            <span className="ml-1.5">
                              <Badge tone="amber">Optional</Badge>
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap font-medium">{v.vchNo ?? "—"}</Td>
                        <Td>{v.party ?? "—"}</Td>
                        <Td right className="num whitespace-nowrap">
                          {inr(v.amount)}
                        </Td>
                        <Td className="max-w-xs text-xs text-slate-600">
                          <span className="line-clamp-2">{v.narration}</span>
                        </Td>
                        <Td>{v.fromErp ? <Badge tone="green">From ERP</Badge> : <Badge>In Tally</Badge>}</Td>
                      </tr>
                      {open === v.id && (
                        <tr className="bg-slate-50/60">
                          <Td />
                          <Td colSpan={7}>
                            <table className="w-full max-w-xl text-xs">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="py-1 text-left font-medium">Ledger</th>
                                  <th className="py-1 text-right font-medium">Debit</th>
                                  <th className="py-1 text-right font-medium">Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {v.ledgers.map((l, i) => (
                                  <tr key={i}>
                                    <td className="py-0.5">{l.ledger}</td>
                                    <td className="num py-0.5 text-right">{l.amount > 0 ? inr(l.amount) : ""}</td>
                                    <td className="num py-0.5 text-right">{l.amount < 0 ? inr(-l.amount) : ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {v.reference && <p className="mt-1 text-xs text-slate-500">Reference: {v.reference}</p>}
                          </Td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </Table>
            {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}
