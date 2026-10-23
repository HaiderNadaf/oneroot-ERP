"use client";

import { ArrowDownLeft, ArrowUpRight, Download, HandCoins, Plus, ReceiptText, Wallet } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { RequirePerm } from "@/components/AppShell";
import { RecordedIn } from "@/components/BranchNotice";
import {
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  RowAction,
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
import { useBranch } from "@/lib/branch";
import { date, downloadCsv, inr, inr0, monthStart, n, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { modeLabel, type ExpenseCategory, type Paged, type PaymentMode, type PettyCashEntry, type PettyCashSummary } from "@/lib/types";

type PettyPage = Paged<PettyCashEntry> & { summary: PettyCashSummary };

/** Where a top-up can come from (same list as the server) */
const SOURCE_MODES: PaymentMode[] = ["CASH", "BANK", "UPI", "CHEQUE"];

/** Below this the fund shows as running low */
const LOW_BALANCE = 1000;

export default function PettyCashPage() {
  return (
    <RequirePerm perms={["expenses.view"]}>
      <PettyCash />
    </RequirePerm>
  );
}

function PettyCash() {
  const { can } = useAuth();
  const { current } = useBranch();
  const canCreate = can("expenses.create");
  const canDelete = can("expenses.delete");
  const toast = useToast();
  const confirm = useConfirm();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<"TOP_UP" | "SPEND" | null>(null);
  const q = useDebounced(search);

  const filters = { from, to, type, categoryId, search: q };
  const { data: categories } = useApi<ExpenseCategory[]>("/expense-categories");
  const { data, error, loading, reload } = useApi<PettyPage>("/petty-cash", { ...filters, page, pageSize: 25 });
  // Spends in the period for the by-category breakdown
  const spends = useApi<PettyPage>("/petty-cash", { from, to, type: "SPEND", pageSize: 500 });

  const s = data?.summary;
  const balance = n(s?.balance);
  const low = !!s && balance < LOW_BALANCE;
  // Adding money or vouchers needs a concrete branch (the fund is kept per branch)
  const canWrite = canCreate && !!current;

  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of spends.data?.items ?? []) m.set(e.category?.name ?? "Other", (m.get(e.category?.name ?? "Other") ?? 0) + n(e.amount));
    return [...m.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  }, [spends.data]);
  const breakdownTotal = breakdown.reduce((t, r) => t + r.amount, 0);
  const max = Math.max(...breakdown.map((r) => r.amount), 1);

  const refresh = () => {
    void reload();
    void spends.reload();
  };
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  async function remove(e: PettyCashEntry) {
    const what = e.type === "TOP_UP" ? "top-up" : "voucher";
    if (!(await confirm(`Delete ${what} ${e.voucherNo} of ${inr(e.amount)}? Its ledger entry is reversed.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/petty-cash/${e.id}`);
      toast.success(`${e.voucherNo} deleted`);
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  async function exportCsv() {
    try {
      const rows = await api.get<PettyPage>("/petty-cash", { ...filters, pageSize: 500 });
      downloadCsv(
        `petty-cash-${from}-to-${to}.csv`,
        ["Voucher No", "Date", "Type", "Category / Source", "Paid To", "Bill No", "In", "Out", "Notes", "Branch", "Entered By"],
        rows.items.map((e) => [
          e.voucherNo,
          e.entryDate.slice(0, 10),
          e.type === "TOP_UP" ? "Top-up" : "Spend",
          e.type === "TOP_UP" ? (e.sourceMode ? modeLabel(e.sourceMode) : "") : e.category?.name,
          e.paidTo,
          e.billNo,
          e.type === "TOP_UP" ? n(e.amount) : "",
          e.type === "SPEND" ? n(e.amount) : "",
          e.notes,
          e.branch?.name,
          e.user?.name,
        ]),
      );
      if (rows.total > rows.items.length) toast.error(`Exported the first ${rows.items.length} of ${rows.total} entries — narrow the dates`);
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Petty Cash"
        subtitle="A small cash fund per branch for tea, courier, minor repairs and other day-to-day spends"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            {canCreate && (
              <>
                <Button
                  variant="secondary"
                  icon={<ArrowDownLeft className="size-4" />}
                  onClick={() => setForm("TOP_UP")}
                  disabled={!current}
                  title={current ? undefined : "Pick a branch in the top bar first"}
                >
                  Top Up
                </Button>
                <Button
                  icon={<Plus className="size-4" />}
                  onClick={() => setForm("SPEND")}
                  disabled={!current}
                  title={current ? undefined : "Pick a branch in the top bar first"}
                >
                  New Voucher
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Balance + period figures */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-forest-800 to-forest-900 p-5 text-white shadow-sm">
          <div aria-hidden className="absolute -right-6 -top-6 text-white/10 [&>svg]:size-36">
            <HandCoins />
          </div>
          <p className="relative text-xs font-medium uppercase tracking-wide text-sidebar-text">
            Fund balance · {current ? current.name : "all branches"}
          </p>
          <p className="relative mt-2 font-display text-4xl font-bold">{s ? inr(balance) : "—"}</p>
          {s && (
            <p className={cx("relative mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", low ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-mint-100")}>
              {balance <= 0 ? "Empty — top up before spending" : low ? "Running low" : "Available to spend"}
            </p>
          )}
          {canWrite && (
            <div className="relative mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setForm("TOP_UP")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-sm font-medium ring-1 ring-white/20 hover:bg-white/25"
              >
                <ArrowDownLeft className="size-4" /> Top Up
              </button>
              <button
                type="button"
                onClick={() => setForm("SPEND")}
                disabled={balance <= 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold-500 px-3 text-sm font-semibold text-forest-900 hover:bg-gold-600 disabled:opacity-50"
              >
                <ReceiptText className="size-4" /> New Voucher
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Topped Up" value={s ? inr(s.toppedUp) : "—"} sub="in this period" icon={<ArrowDownLeft />} tone="green" />
          <StatCard label="Spent" value={s ? inr(s.spent) : "—"} sub="in this period" icon={<ArrowUpRight />} tone="red" />
          <StatCard label="Vouchers" value={s ? s.vouchers : "—"} sub="spends in this period" icon={<Wallet />} tone="blue" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card bodyClassName="p-0" className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={reset(setSearch)} placeholder="Voucher, paid to, bill no…" className="w-full sm:w-56" />
            <div className="flex w-full items-center gap-1.5 sm:w-auto">
              <DateInput value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
              <span className="text-xs text-slate-400">to</span>
              <DateInput value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
            </div>
            <Select value={type} onChange={(e) => reset(setType)(e.target.value)} className="min-w-0 flex-1 sm:w-32 sm:flex-none" aria-label="Type">
              <option value="">All Entries</option>
              <option value="TOP_UP">Top-ups</option>
              <option value="SPEND">Spends</option>
            </Select>
            <Select value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label="Category">
              <option value="">All Categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
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
                  <Th>Voucher</Th>
                  <Th>For / From</Th>
                  <Th>Paid To</Th>
                  <Th right>In</Th>
                  <Th right>Out</Th>
                  {canDelete && <Th />}
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRow colSpan={canDelete ? 6 : 5} />
                ) : !data?.items.length ? (
                  <EmptyRow colSpan={canDelete ? 6 : 5}>
                    No petty cash entries for these filters.{" "}
                    {canWrite && (
                      <button className="font-medium text-brand-700 underline" onClick={() => setForm("TOP_UP")}>
                        Top Up the Fund
                      </button>
                    )}
                  </EmptyRow>
                ) : (
                  data.items.map((e) => {
                    const topUp = e.type === "TOP_UP";
                    return (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cx(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                                topUp ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600",
                              )}
                            >
                              {topUp ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-medium text-slate-900">{e.voucherNo}</p>
                              <p className="text-xs text-slate-500">
                                {date(e.entryDate)}
                                {e.user?.name && ` · ${e.user.name}`}
                                {!current && e.branch && ` · ${e.branch.code}`}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <span className="font-medium text-slate-800">{topUp ? `Top-up from ${e.sourceMode ? modeLabel(e.sourceMode) : "cash"}` : e.category?.name}</span>
                          {e.notes && <p className="max-w-64 truncate text-xs text-slate-500">{e.notes}</p>}
                        </Td>
                        <Td>
                          {e.paidTo || "—"}
                          {e.billNo && <p className="text-xs text-slate-500">Bill {e.billNo}</p>}
                        </Td>
                        <Td right className={topUp ? "font-medium text-brand-700" : "text-slate-300"}>
                          {topUp ? inr(e.amount) : "—"}
                        </Td>
                        <Td right className={topUp ? "text-slate-300" : "font-medium text-red-600"}>
                          {topUp ? "—" : inr(e.amount)}
                        </Td>
                        {canDelete && (
                          <Td right>
                            <RowAction kind="delete" title={`Delete ${e.voucherNo}`} onClick={() => remove(e)} />
                          </Td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {data && data.items.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <Td colSpan={3} className="text-xs uppercase tracking-wide text-slate-500">
                      Period total ({data.total} entr{data.total === 1 ? "y" : "ies"})
                    </Td>
                    <Td right className="text-brand-700">
                      {inr(data.summary.toppedUp)}
                    </Td>
                    <Td right className="text-red-600">
                      {inr(data.summary.spent)}
                    </Td>
                    {canDelete && <Td />}
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>

        <Card title="Spent by Category">
          {spends.loading && !spends.data ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : !breakdown.length ? (
            <p className="py-6 text-center text-sm text-slate-400">No spends in this period</p>
          ) : (
            <ul className="space-y-2.5">
              {breakdown.map((r) => (
                <li key={r.label}>
                  <div className="mb-1 flex justify-between gap-2 text-xs">
                    <span className="text-slate-600">{r.label}</span>
                    <span className="num font-medium text-slate-800">
                      {inr0(r.amount)}
                      <span className="ml-1.5 font-normal text-slate-400">{Math.round((r.amount / breakdownTotal) * 100)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(r.amount / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Every top-up and voucher posts to the <span className="font-medium text-slate-700">Petty Cash</span> ledger; spends go to their expense
            category&apos;s account.
          </p>
        </Card>
      </div>

      {form === "TOP_UP" && (
        <TopUpForm
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
      {form === "SPEND" && (
        <SpendForm
          balance={balance}
          categories={categories ?? []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function TopUpForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [sourceMode, setSourceMode] = useState<PaymentMode>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!(Number(amount) > 0)) return toast.error("Enter an amount greater than zero");
    setSaving(true);
    try {
      const saved = await api.post<PettyCashEntry>("/petty-cash/top-up", { amount: Number(amount), entryDate, sourceMode, notes: notes.trim() || undefined });
      toast.success(`${saved.voucherNo}: ${inr(amount)} added to petty cash`);
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
      title="Top Up Petty Cash"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="petty-topup-form" loading={saving}>
            Add to Fund
          </Button>
        </>
      }
    >
      <form id="petty-topup-form" onSubmit={save} className="space-y-3">
        <Field label="Amount (₹)" required>
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            <DateInput value={entryDate} max={today()} onChange={(e) => setEntryDate(e.target.value)} required />
          </Field>
          <Field label="Taken From">
            <Select value={sourceMode} onChange={(e) => setSourceMode(e.target.value as PaymentMode)}>
              {SOURCE_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === "CASH" ? "Cash drawer" : modeLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Weekly float handed to the store keeper" />
        </Field>
        <RecordedIn />
      </form>
    </Modal>
  );
}

function SpendForm({ balance, categories, onClose, onSaved }: { balance: number; categories: ExpenseCategory[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [paidTo, setPaidTo] = useState("");
  const [billNo, setBillNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const over = Number(amount) > balance + 0.004;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) return toast.error("Choose what the money was spent on");
    if (!(Number(amount) > 0)) return toast.error("Enter an amount greater than zero");
    if (over) return toast.error(`Only ${inr(balance)} is left in petty cash — top it up first`);
    setSaving(true);
    try {
      const saved = await api.post<PettyCashEntry>("/petty-cash/spend", {
        amount: Number(amount),
        categoryId,
        entryDate,
        paidTo: paidTo.trim() || undefined,
        billNo: billNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Voucher ${saved.voucherNo} for ${inr(amount)} recorded`);
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
      title="New Petty Cash Voucher"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="petty-spend-form" loading={saving} disabled={over}>
            Save Voucher
          </Button>
        </>
      }
    >
      <form id="petty-spend-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm sm:col-span-2">
          <span className="text-brand-800">Available in petty cash</span>
          <span className="num font-semibold text-brand-800">{inr(balance)}</span>
        </div>
        <Field label="Spent On" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required autoFocus>
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" required hint={over ? "More than the fund holds" : undefined}>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className={cx(over && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
          />
        </Field>
        <Field label="Date" required>
          <DateInput value={entryDate} max={today()} onChange={(e) => setEntryDate(e.target.value)} required />
        </Field>
        <Field label="Paid To">
          <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="e.g. Tea stall, courier" />
        </Field>
        <Field label="Bill / Receipt No." className="sm:col-span-2">
          <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {!categories.length && (
          <p className="text-xs text-amber-700 sm:col-span-2">No expense categories yet — add them from the Expenses page (Categories).</p>
        )}
        <RecordedIn className="sm:col-span-2" />
      </form>
    </Modal>
  );
}
