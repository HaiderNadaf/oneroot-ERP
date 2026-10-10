"use client";

import { BellRing, Copy, MessageCircle, PhoneCall, Send, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  Table,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, inr0 } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { OverdueRow, ReminderChannel } from "@/lib/types";

interface RemindersResponse {
  rows: OverdueRow[];
  total: number;
  config: { whatsappConfigured: boolean; template: string; graceDays: number; autoReminders: boolean };
}

const CHANNELS: { value: ReminderChannel; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "CALL", label: "Phone call" },
  { value: "SMS", label: "SMS" },
  { value: "VISIT", label: "Visit" },
  { value: "NOTE", label: "Note" },
];

export default function RemindersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [minDays, setMinDays] = useState("0");
  const [all, setAll] = useState(false);
  const [logFor, setLogFor] = useState<OverdueRow | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<RemindersResponse>("/reminders/customers", { search: q, minDays, all: all ? "true" : undefined });
  const cfg = data?.config;

  async function logReminder(row: OverdueRow, channel: ReminderChannel, message?: string) {
    try {
      await api.post(`/reminders/customers/${row.id}`, { channel, message, amount: row.balance });
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  function whatsapp(row: OverdueRow) {
    if (!row.phone) return toast.error(`${row.name} has no mobile number`);
    window.open(`https://wa.me/91${row.phone}?text=${encodeURIComponent(row.message)}`, "_blank", "noopener,noreferrer");
    void logReminder(row, "WHATSAPP", row.message);
  }

  async function sendApi(row: OverdueRow) {
    setSending(row.id);
    try {
      await api.post(`/reminders/customers/${row.id}/send`, {});
      toast.success(`WhatsApp reminder sent to ${row.name}`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(null);
    }
  }

  async function sendAll() {
    if (!data) return;
    const ok = await confirm(`Send WhatsApp reminders to every overdue customer not reminded in the last ${cfg?.graceDays ?? 7} days?`, { confirmLabel: "Send reminders" });
    if (!ok) return;
    setRunning(true);
    try {
      const r = await api.post<{ sent: number; skipped: number; reason?: string }>("/reminders/run");
      toast.success(r.reason ? r.reason : `${r.sent} sent, ${r.skipped} skipped`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  }

  const rows = data?.rows ?? [];
  const neverReminded = rows.filter((r) => !r.lastReminder).length;

  return (
    <>
      <PageHeader
        title="Due reminders"
        subtitle={`Customers whose bills are past the due date${cfg ? ` (plus ${cfg.graceDays} grace days)` : ""} — send WhatsApp reminders and keep a log of every follow-up`}
        actions={
          <>
            {can("ADMIN") && (
              <Link href="/admin/settings">
                <Button variant="ghost" icon={<Settings className="size-4" />}>
                  Template & rules
                </Button>
              </Link>
            )}
            {cfg?.whatsappConfigured && can("MANAGER") && (
              <Button icon={<Send className="size-4" />} loading={running} onClick={sendAll} disabled={!rows.length}>
                Send all via WhatsApp
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Overdue customers" value={rows.length} icon={<BellRing />} tone="red" />
        <StatCard label="Overdue amount" value={inr0(data?.total ?? 0)} tone="red" />
        <StatCard label="Never reminded" value={neverReminded} tone="amber" />
        <StatCard
          label="WhatsApp sending"
          value={<span className="text-base">{cfg?.whatsappConfigured ? (cfg.autoReminders ? "Automatic, daily" : "API ready (manual)") : "Click-to-chat"}</span>}
          sub={cfg?.whatsappConfigured ? undefined : "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID on the server to send automatically"}
        />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, village…" className="min-w-60 flex-1" />
          <Select value={minDays} onChange={(e) => setMinDays(e.target.value)} className="w-40" aria-label="Minimum days overdue">
            <option value="0">Any overdue</option>
            <option value="15">15+ days</option>
            <option value="30">30+ days</option>
            <option value="60">60+ days</option>
            <option value="90">90+ days</option>
          </Select>
          <div className="px-1">
            <Checkbox label="Include dues not yet overdue" checked={all} onChange={setAll} />
          </div>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th right>Balance</Th>
                <Th right>Overdue</Th>
                <Th right>Days</Th>
                <Th>Last reminder</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={6} />
              ) : !rows.length ? (
                <EmptyRow colSpan={6}>Nobody is overdue — nice.</EmptyRow>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/customers/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {r.name}
                      </Link>
                      {r.creditHold && (
                        <span className="ml-1.5">
                          <Badge tone="red">Credit on hold</Badge>
                        </span>
                      )}
                      <p className="text-xs text-slate-500">{[r.phone, r.village].filter(Boolean).join(" · ") || "—"}</p>
                    </Td>
                    <Td right>{inr(r.balance)}</Td>
                    <Td right className="font-semibold text-red-600">
                      {inr(r.overdue.amount)}
                    </Td>
                    <Td right className={cx("font-medium", r.overdue.days >= 60 ? "text-red-600" : r.overdue.days >= 30 ? "text-amber-700" : "text-slate-700")}>
                      {r.overdue.days}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {r.lastReminder ? (
                        <>
                          {dateTime(r.lastReminder.sentAt)}
                          <br />
                          <span className="text-slate-400">
                            {CHANNELS.find((c) => c.value === r.lastReminder!.channel)?.label}
                            {r.lastReminder.automatic ? " · automatic" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-700">Never</span>
                      )}
                    </Td>
                    <Td right>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="secondary" icon={<MessageCircle className="size-4" />} onClick={() => whatsapp(r)} disabled={!r.phone} title="Open WhatsApp with the reminder text">
                          WhatsApp
                        </Button>
                        {cfg?.whatsappConfigured && (
                          <Button size="sm" variant="secondary" icon={<Send className="size-4" />} loading={sending === r.id} onClick={() => sendApi(r)} disabled={!r.phone} title="Send through the WhatsApp API">
                            Send
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" icon={<PhoneCall className="size-4" />} onClick={() => setLogFor(r)} title="Log a call, visit or note">
                          Log
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      <LogModal
        row={logFor}
        onClose={() => setLogFor(null)}
        onSaved={() => {
          setLogFor(null);
          void reload();
        }}
      />
    </>
  );
}

function LogModal({ row, onClose, onSaved }: { row: OverdueRow | null; onClose: () => void; onSaved: () => void }) {
  return row ? <LogBody row={row} onClose={onClose} onSaved={onSaved} /> : null;
}

function LogBody({ row, onClose, onSaved }: { row: OverdueRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [channel, setChannel] = useState<ReminderChannel>("CALL");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/reminders/customers/${row.id}`, { channel, message: message.trim() || undefined, amount: row.balance });
      toast.success("Follow-up logged");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Log follow-up · ${row.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="log-reminder" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="log-reminder" onSubmit={save} className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Balance {inr(row.balance)} · overdue {inr(row.overdue.amount)} for {row.overdue.days} days
        </p>
        <Field label="How">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel)}>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" hint="e.g. Promised to pay after harvest on 20th">
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
        </Field>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Reminder text:</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            onClick={() => navigator.clipboard?.writeText(row.message).then(() => toast.success("Copied"))}
          >
            <Copy className="size-3.5" /> Copy
          </button>
        </div>
        <p className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">{row.message}</p>
        <p className="text-[11px] text-slate-400">Oldest due date {row.overdue.oldestDue ? date(row.overdue.oldestDue) : "—"}</p>
        <Input type="hidden" value="" readOnly />
      </form>
    </Modal>
  );
}
