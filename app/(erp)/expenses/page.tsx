"use client";

import { Download, Plus, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { RecordedIn } from "@/components/BranchNotice";
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
  PageHeader,
  Pagination,
  RowAction,
  Select,
  Table,
  Td,
  Textarea,
  Th,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, downloadCsv, inr, inr0, monthStart, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PAYMENT_MODES, modeLabel, type Expense, type ExpenseCategory, type Paged, type PaymentMode } from "@/lib/types";
import { LazyCategoryManager } from "@/components/lazy";

const SERIES_1 = "#2a78d6";


export default function ExpensesPage() {
  return (
    <RequirePerm perms={["expenses"]}>
      <Expenses />
    </RequirePerm>
  );
}

function Expenses() {
  const toast = useToast();
  const confirm = useConfirm();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  const filters = { from, to, categoryId };
  const { data: categories, reload: reloadCats } = useApi<ExpenseCategory[]>("/expense-categories");
  const { data, error, loading, reload } = useApi<Paged<Expense>>("/expenses", { ...filters, page, pageSize: 25 });
  const all = useApi<Paged<Expense>>("/expenses", { ...filters, pageSize: 500 });

  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all.data?.items ?? []) m.set(e.category?.name ?? "Other", (m.get(e.category?.name ?? "Other") ?? 0) + n(e.amount));
    return [...m.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  }, [all.data]);
  const breakdownTotal = breakdown.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(...breakdown.map((r) => r.amount), 1);

  const refresh = () => {
    void reload();
    void all.reload();
  };

  async function remove(e: Expense) {
    const ok = await confirm(`Delete this ${inr(e.amount)} ${e.category?.name ?? ""} expense from ${date(e.expenseDate)}?`, {
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api.del(`/expenses/${e.id}`);
      toast.success("Expense deleted");
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  async function exportCsv() {
    const rows = await api.get<Paged<Expense>>("/expenses", { ...filters, pageSize: 500 });
    downloadCsv(
      `expenses-${from}-to-${to}.csv`,
      ["Date", "Category", "Amount", "Mode", "Paid To", "Reference", "Notes", "Entered By"],
      rows.items.map((e) => [e.expenseDate.slice(0, 10), e.category?.name, n(e.amount), e.mode, e.paidTo, e.reference, e.notes, e.user?.name]),
    );
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Rent, salaries, electricity, transport and other running costs"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            <Button variant="secondary" icon={<Tags className="size-4" />} onClick={() => setCatsOpen(true)}>
              Categories
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add Expense
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card bodyClassName="p-0" className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <DateInput value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="From date" />
              <span className="text-sm text-slate-400">to</span>
              <DateInput value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="To date" />
            </div>
            <Select value={categoryId} onChange={(e) => (setCategoryId(e.target.value), setPage(1))} className="w-full sm:w-48">
              <option value="">All Categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <div className="flex-1" />
            {data && (
              <p className="text-sm text-slate-500">
                Total <span className="num font-semibold text-slate-900">{inr(data.totalAmount)}</span>
              </p>
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
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th>Paid To</Th>
                  <Th>Mode</Th>
                  <Th right>Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRow colSpan={6} />
                ) : !data?.items.length ? (
                  <EmptyRow colSpan={6}>
                    No expenses in this period.{" "}
                    <button className="font-medium text-brand-700 underline" onClick={() => setAddOpen(true)}>
                      Record One
                    </button>
                  </EmptyRow>
                ) : (
                  data.items.map((e) => (
                    <tr key={e.id} className="group hover:bg-slate-50">
                      <Td className="whitespace-nowrap">{date(e.expenseDate)}</Td>
                      <Td>
                        <span className="font-medium text-slate-900">{e.category?.name}</span>
                        {e.notes && <p className="max-w-72 truncate text-xs text-slate-500">{e.notes}</p>}
                      </Td>
                      <Td>
                        {e.paidTo || "—"}
                        {e.reference && <p className="text-xs text-slate-500">Ref {e.reference}</p>}
                      </Td>
                      <Td>
                        <Badge>{modeLabel(e.mode)}</Badge>
                      </Td>
                      <Td right className="font-medium">
                        {inr(e.amount)}
                      </Td>
                      <Td right>
                        <RowAction kind="delete" title="Delete expense" onClick={() => remove(e)} />
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>

        <Card title="By Category">
          {all.loading && !all.data ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : !breakdown.length ? (
            <p className="py-6 text-center text-sm text-slate-400">No expenses in this period</p>
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
                    <div className="h-2 rounded-full" style={{ width: `${(r.amount / max) * 100}%`, background: SERIES_1 }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {all.data && all.data.total > all.data.items.length && (
            <p className="mt-3 text-xs text-slate-400">Based on the latest {all.data.items.length} of {all.data.total} expenses.</p>
          )}
        </Card>
      </div>

      <AddExpenseModal
        open={addOpen}
        categories={categories ?? []}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          refresh();
        }}
      />
      <LazyCategoryManager
        kind="expense"
        open={catsOpen}
        onClose={() => {
          setCatsOpen(false);
          void reloadCats();
        }}
      />
    </>
  );
}

function AddExpenseModal({
  open,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return <AddExpenseForm categories={categories} onClose={onClose} onSaved={onSaved} />;
}

function AddExpenseForm({
  categories,
  onClose,
  onSaved,
}: {
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [paidTo, setPaidTo] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return toast.error("Choose a category");
    if (!(Number(amount) > 0)) return toast.error("Enter an amount greater than zero");
    setSaving(true);
    try {
      await api.post("/expenses", {
        categoryId,
        amount: Number(amount),
        expenseDate,
        mode,
        paidTo: paidTo.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Expense of ${inr(amount)} recorded`);
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
      title="Add Expense"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={saving}>
            Save Expense
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required autoFocus>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" required>
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Date" required>
          <DateInput value={expenseDate} max={today()} onChange={(e) => setExpenseDate(e.target.value)} required />
        </Field>
        <Field label="Paid By">
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.filter((m) => m !== "CREDIT").map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid To">
          <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="e.g. TNEB, landlord" />
        </Field>
        <Field label="Reference" hint="Bill no., UPI txn id, cheque no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <RecordedIn className="sm:col-span-2" />
      </form>
    </Modal>
  );
}
