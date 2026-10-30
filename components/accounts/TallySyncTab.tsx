"use client";

import { CheckCircle2, Power, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged } from "@/lib/types";

type SyncStatus = "PENDING" | "SENT" | "DONE" | "FAILED" | "SKIPPED";

interface TallyStatus {
  company: string | null;
  from: string | null;
  agentSeenAt: string | null;
  agentOnline: boolean;
  agentTokenSet: boolean;
  counts: Partial<Record<SyncStatus, number>>;
  stuck: number;
}

interface SyncJob {
  id: number;
  source: "JOURNAL" | "PO" | "CANCEL" | "SETUP";
  refNo: string | null;
  status: SyncStatus;
  vchType: string | null;
  vchNo: string | null;
  vchDate: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  doneAt: string | null;
}

interface SyncPreview extends SyncJob {
  response: string | null;
  built: { kind: string; xml: string }[] | { skip?: string; wait?: string };
}

const STATUS: Record<SyncStatus, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  PENDING: { label: "Waiting", tone: "blue" },
  SENT: { label: "Sent to Tally", tone: "amber" },
  DONE: { label: "In Tally", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  SKIPPED: { label: "Not sent", tone: "slate" },
};

const SOURCE_LABEL: Record<SyncJob["source"], string> = {
  JOURNAL: "Voucher",
  PO: "Purchase order",
  CANCEL: "Cancel",
  SETUP: "Opening balances",
};

export function TallySyncTab() {
  const { can, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<SyncStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const q = useDebounced(search);
  const st = useApi<TallyStatus>("/tally-sync/status");
  const list = useApi<Paged<SyncJob>>("/tally-sync", { status, search: q, page, pageSize: 30 });
  const canEdit = can("accounts.edit");

  const reloadAll = () => {
    st.reload();
    list.reload();
  };

  async function run(key: string, job: () => Promise<string | void>) {
    setBusy(key);
    try {
      const msg = await job();
      if (msg) toast.success(msg);
      reloadAll();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const retry = (ids?: number[]) =>
    run(ids ? `retry-${ids[0]}` : "retry-all", async () => {
      const r = await api.post<{ requeued: number }>("/tally-sync/retry", ids ? { ids } : {});
      return `${r.requeued} document${r.requeued === 1 ? "" : "s"} queued again`;
    });

  async function skip(job: SyncJob) {
    const ok = await confirm(
      `Mark ${job.vchNo ?? job.refNo ?? `#${job.id}`} as handled? It will not be sent to Tally. Use this only when it was entered in Tally by hand or is not needed there.`,
      { confirmLabel: "Mark Handled" },
    );
    if (ok) await run(`skip-${job.id}`, async () => void (await api.post(`/tally-sync/${job.id}/skip`)));
  }

  const s = st.data;
  const on = !!s?.from;
  const online = !!s?.agentOnline;
  const failed = s?.counts.FAILED ?? 0;

  return (
    <div className="space-y-4">
      {st.error ? (
        <ErrorBox message={st.error} onRetry={st.reload} />
      ) : !s ? (
        <Spinner page />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card
            title="Automatic Sync to Tally Prime"
            actions={
              <Button variant="ghost" size="sm" icon={<RefreshCw className="size-4" />} onClick={reloadAll} loading={st.refreshing && !st.loading} loadingText="">
                Refresh
              </Button>
            }
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Status</dt>
              <dd>{on ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</dd>
              <dt className="text-slate-500">Tally company</dt>
              <dd className="font-medium">{s.company ?? "—"}</dd>
              <dt className="text-slate-500">Documents from</dt>
              <dd>{s.from ? date(s.from) : "—"}</dd>
              <dt className="text-slate-500">Agent on Tally server</dt>
              <dd>
                {online ? <Badge tone="green">Online</Badge> : <Badge tone={on ? "red" : "slate"}>Not seen</Badge>}
                {s.agentSeenAt && <span className="ml-2 text-xs text-slate-500">last call {dateTime(s.agentSeenAt)}</span>}
              </dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(STATUS) as SyncStatus[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setStatus(status === k ? "" : k);
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs ${status === k ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="block text-slate-500">{STATUS[k].label}</span>
                  <span className="num text-base font-semibold text-slate-800">{s.counts[k] ?? 0}</span>
                </button>
              ))}
            </div>
            {s.stuck > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                {s.stuck} document{s.stuck === 1 ? " was" : "s were"} sent over 15 minutes ago without a reply from Tally. Check Tally&apos;s Day Book: if it is there, mark it handled; if not, retry.
              </p>
            )}
            {on && !online && (
              <p className="mt-3 text-xs text-red-700">
                The agent has not called in for a while. Documents are kept and go to Tally in order once Tally Prime is open on the server with {s.company} loaded.
              </p>
            )}
            {(canEdit || isAdmin) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit && failed > 0 && (
                  <Button icon={<RotateCcw className="size-4" />} loading={busy === "retry-all"} onClick={() => retry()}>
                    Retry All Failed ({failed})
                  </Button>
                )}
                {isAdmin && on && (
                  <Button
                    variant="secondary"
                    icon={<Power className="size-4" />}
                    loading={busy === "disable"}
                    onClick={async () => {
                      if (await confirm("Turn off the automatic sync? New documents will not be queued until it is turned on again; turning it back on sends what was missed.", { confirmLabel: "Turn Off" }))
                        await run("disable", async () => {
                          await api.post("/tally-sync/disable");
                          return "Tally sync turned off";
                        });
                    }}
                  >
                    Turn Off
                  </Button>
                )}
              </div>
            )}
          </Card>
          {isAdmin && !on ? <EnableCard tokenSet={s.agentTokenSet} firstTime={!Object.values(s.counts).some(Boolean)} onDone={reloadAll} /> : <HowItWorks />}
        </div>
      )}

      <Card
        title="Documents"
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Document no."
                className="w-44 pl-8"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as SyncStatus | "");
                setPage(1);
              }}
              aria-label="Status"
            >
              <option value="">All states</option>
              {(Object.keys(STATUS) as SyncStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS[k].label}
                </option>
              ))}
            </Select>
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
                  <Th>#</Th>
                  <Th>Document</Th>
                  <Th>In Tally As</Th>
                  <Th>Date</Th>
                  <Th>State</Th>
                  <Th>Message</Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {list.loading ? (
                  <LoadingRow colSpan={7} />
                ) : !list.data?.items.length ? (
                  <EmptyRow colSpan={7}>{on ? "Nothing here" : "Turn on the sync to start sending documents to Tally"}</EmptyRow>
                ) : (
                  list.data.items.map((j) => (
                    <tr key={j.id}>
                      <Td className="num text-slate-500">{j.id}</Td>
                      <Td>
                        <span className="font-medium">{j.refNo ?? "—"}</span>
                        <span className="block text-xs text-slate-500">{SOURCE_LABEL[j.source]}</span>
                      </Td>
                      <Td>
                        {j.vchType ? (
                          <>
                            {j.vchType}
                            <span className="block text-xs text-slate-500">{j.vchNo}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{j.vchDate ? date(j.vchDate) : dateTime(j.createdAt)}</Td>
                      <Td>
                        <Badge tone={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
                        {j.attempts > 1 && <span className="block text-xs text-slate-500">{j.attempts} tries</span>}
                      </Td>
                      <Td className="max-w-md text-xs text-slate-600">{j.error ?? (j.status === "DONE" && j.doneAt ? `Accepted ${dateTime(j.doneAt)}` : "")}</Td>
                      <Td right className="whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(j.id)}>
                            Details
                          </Button>
                          {canEdit && (j.status === "FAILED" || j.status === "SENT") && (
                            <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={busy === `retry-${j.id}`} onClick={() => retry([j.id])}>
                              Retry
                            </Button>
                          )}
                          {canEdit && j.status !== "DONE" && j.status !== "SKIPPED" && (
                            <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} loading={busy === `skip-${j.id}`} onClick={() => skip(j)}>
                              Mark Handled
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
            {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} />}
          </>
        )}
      </Card>
      <JobDetails id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function EnableCard({ tokenSet, firstTime, onDone }: { tokenSet: boolean; firstTime: boolean; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [company, setCompany] = useState("ENP INPUT STORE");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return today(new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1));
  });
  const [busy, setBusy] = useState(false);

  async function enable() {
    if (!company.trim()) return toast.error("Enter the Tally company name");
    const ok = await confirm(
      firstTime
        ? `Start sending to "${company.trim()}"? Balances before ${date(from)} go to Tally as opening balances, then every PO, GRN, sale, bill and payment from ${date(from)} is sent in order. The company in Tally should be empty, and nobody should enter these documents in Tally by hand from now on.`
        : `Turn the sync back on for "${company.trim()}"? Documents posted while it was off are sent now, in order.`,
      { confirmLabel: "Turn On" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.post<{ queued: number }>("/tally-sync/enable", { company: company.trim(), from });
      toast.success(`Tally sync is on · ${r.queued} document${r.queued === 1 ? "" : "s"} queued`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Turn On Automatic Sync">
      <div className="space-y-3">
        <Field label="Tally Company Name" hint="Exactly as it appears in Tally Prime">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} className="max-w-sm" />
        </Field>
        {firstTime && (
          <Field label="Send Documents From" hint="Usually the first day of the financial year. Earlier balances become Tally's opening balances.">
            <DateInput value={from} onChange={(e) => setFrom(e.target.value)} max={today()} className="max-w-xs" />
          </Field>
        )}
        {!tokenSet && (
          <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            TALLY_AGENT_TOKEN is not set on the ERP server, so the agent on the Tally server cannot sign in yet. Ask your developer to set it.
          </p>
        )}
        <Button icon={<Power className="size-4" />} loading={busy} onClick={enable}>
          Turn On
        </Button>
        <p className="text-xs text-slate-500">
          Before turning on, in Tally press F11 and enable GST, inventory, Purchase Order processing and tracking numbers, and set voucher numbering to Manual. The agent folder <i>tally-agent</i> in the backend has the full steps.
        </p>
      </div>
    </Card>
  );
}

function HowItWorks() {
  return (
    <Card title="What Goes to Tally">
      <ul className="space-y-1.5 text-sm text-slate-700">
        <li>
          <b>PO approved</b> → Purchase Order · <b>GRN</b> → Receipt Note (stock in)
        </li>
        <li>
          <b>Purchase bill</b> → Purchase invoice linked to its Receipt Note (vendor ledger + GST)
        </li>
        <li>
          <b>Sale</b> → Sales invoice · <b>Return</b> → Credit Note · <b>Collection / payment</b> → Receipt / Payment
        </li>
        <li>
          <b>Expenses, petty cash, bank deposits</b> → Payment / Contra · <b>Stock write-off</b> → Stock Journal
        </li>
        <li>
          <b>Cancelled or deleted</b> in the ERP → the voucher is cancelled in Tally
        </li>
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Amounts come straight from the ERP&apos;s own posted entries and each voucher is checked to balance to the paisa, so every ledger in Tally matches the ERP. Don&apos;t enter these documents in Tally by hand, or they will be counted twice.
      </p>
    </Card>
  );
}

function JobDetails({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, error, loading } = useApi<SyncPreview>(id ? `/tally-sync/${id}` : null);
  const built = data?.built;
  return (
    <Modal open={id !== null} onClose={onClose} title={data ? `${data.vchType ?? SOURCE_LABEL[data.source]} ${data.vchNo ?? data.refNo ?? ""}` : "Details"} size="xl">
      {error ? (
        <ErrorBox message={error} />
      ) : loading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-3 text-sm">
          {data.error && <p className="rounded-lg bg-red-50 p-2.5 text-red-800">{data.error}</p>}
          {Array.isArray(built) ? (
            built.map((p, i) => (
              <div key={i}>
                <p className="mb-1 text-xs font-medium text-slate-600">{p.kind === "masters" ? "Ledgers / items created first" : "Sent to Tally"}</p>
                <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-2.5 text-[11px] leading-snug">{p.xml}</pre>
              </div>
            ))
          ) : (
            <p className="text-slate-600">{built?.skip ?? built?.wait}</p>
          )}
          {data.response && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Tally&apos;s reply</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2.5 text-[11px]">{data.response}</pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
