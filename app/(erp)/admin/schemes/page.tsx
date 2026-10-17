"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { ProductPicker } from "@/components/pickers";
import { ActionsTd, ActionsTh, Badge, Button, Card, Checkbox, DateInput, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, RowAction, Select, Table, Tabs, Td, Textarea, Th, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { date, inr, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CustomerType, Product, Scheme, SchemeType } from "@/lib/types";

type Tab = "schemes" | "types";
const TYPE_LABEL: Record<SchemeType, string> = { BUY_X_GET_Y: "Buy X Get Y Free", PCT_OFF: "% off", FLAT_OFF: "Flat ₹ Off per Unit" };
/** Scheme dates are whole local days; the API sends them as ISO timestamps */
const dayOf = (iso: string) => today(new Date(iso));

export default function SchemesPage() {
  return (
    <RequirePerm perms={["admin.schemes"]}>
      <Pricing />
    </RequirePerm>
  );
}

function Pricing() {
  const [tab, setTab] = useState<Tab>("schemes");
  return (
    <>
      <PageHeader title="Schemes & Customer Types" subtitle="Company schemes apply by themselves at the counter (one per line, the best for the farmer); customer types add a fixed discount on top" />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "schemes", label: "Schemes" },
          { value: "types", label: "Customer Types" },
        ]}
      />
      {tab === "schemes" ? <SchemesTab /> : <TypesTab />}
    </>
  );
}

function describe(s: Scheme) {
  if (s.type === "BUY_X_GET_Y") return `Buy ${s.buyQty} get ${s.freeQty} free`;
  if (s.type === "PCT_OFF") return `${n(s.pct)}% off`;
  return `${inr(s.flat)} off per unit`;
}

function SchemesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Scheme | null | "new">(null);
  const { data, error, loading, reload } = useApi<Scheme[]>("/schemes", { status });
  const now = today();

  async function remove(s: Scheme) {
    if (!(await confirm(`Delete scheme "${s.name}"? If bills used it, it is switched off instead.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      const r = await api.del<{ deleted: boolean }>(`/schemes/${s.id}`);
      toast.success(r.deleted ? "Scheme deleted" : "Scheme switched off (bills used it)");
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Filter">
          <option value="all">All Schemes</option>
          <option value="active">Running Today</option>
          <option value="">Switched On</option>
        </Select>
        <div className="flex-1" />
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New Scheme
        </Button>
      </div>
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Scheme</Th>
              <Th>Offer</Th>
              <Th>Products</Th>
              <Th>Period</Th>
              <Th>Claim</Th>
              <Th right>Used On</Th>
              <Th>Status</Th>
              <ActionsTh />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={8} />
            ) : !data?.length ? (
              <EmptyRow colSpan={8}>No schemes yet — add the company offers you pass on to farmers</EmptyRow>
            ) : (
              data.map((s) => {
                const running = s.isActive && dayOf(s.from) <= now && (!s.to || dayOf(s.to) >= now);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">
                      {s.name}
                      {s.notes && <p className="text-xs font-normal text-slate-500">{s.notes}</p>}
                    </Td>
                    <Td>{describe(s)}</Td>
                    <Td className="max-w-xs text-xs text-slate-600">{s.products.map((p) => p.product?.name ?? p.productId).join(", ")}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {date(s.from)} – {s.to ? date(s.to) : "open"}
                    </Td>
                    <Td>{s.claimable ? <Badge tone="blue">From Company</Badge> : <Badge>Own Cost</Badge>}</Td>
                    <Td right>{s._count?.saleItems ?? 0} lines</Td>
                    <Td>{!s.isActive ? <Badge>Off</Badge> : running ? <Badge tone="green">Running</Badge> : dayOf(s.from) > now ? <Badge tone="amber">Scheduled</Badge> : <Badge>Ended</Badge>}</Td>
                    <ActionsTd>
                      <RowAction kind="edit" title={`Edit ${s.name}`} onClick={() => setEditing(s)} />
                      <RowAction kind="delete" title={`Delete ${s.name}`} onClick={() => remove(s)} />
                    </ActionsTd>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
      {editing && (
        <SchemeForm
          scheme={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

function SchemeForm({ scheme, onClose, onSaved }: { scheme: Scheme | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(scheme?.name ?? "");
  const [type, setType] = useState<SchemeType>(scheme?.type ?? "BUY_X_GET_Y");
  const [products, setProducts] = useState<{ id: string; name: string }[]>(scheme?.products.map((p) => ({ id: p.productId, name: p.product?.name ?? p.productId })) ?? []);
  const [buyQty, setBuyQty] = useState(String(scheme?.buyQty ?? 10));
  const [freeQty, setFreeQty] = useState(String(scheme?.freeQty ?? 1));
  const [pct, setPct] = useState(scheme?.pct ? String(n(scheme.pct)) : "");
  const [flat, setFlat] = useState(scheme?.flat ? String(n(scheme.flat)) : "");
  const [from, setFrom] = useState(scheme ? dayOf(scheme.from) : today());
  const [to, setTo] = useState(scheme?.to ? dayOf(scheme.to) : "");
  const [claimable, setClaimable] = useState(scheme?.claimable ?? true);
  const [isActive, setIsActive] = useState(scheme?.isActive ?? true);
  const [notes, setNotes] = useState(scheme?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!products.length) return toast.error("Add at least one product");
    const body = {
      name: name.trim(),
      type,
      productIds: products.map((p) => p.id),
      buyQty: Number(buyQty) || undefined,
      freeQty: Number(freeQty) || undefined,
      pct: Number(pct) || undefined,
      flat: Number(flat) || undefined,
      from,
      to: to || undefined,
      claimable,
      isActive,
      notes: notes.trim() || undefined,
    };
    setSaving(true);
    try {
      if (scheme) await api.patch(`/schemes/${scheme.id}`, body);
      else await api.post("/schemes", body);
      toast.success(scheme ? "Scheme updated" : "Scheme created — it applies at the counter from the start date");
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
      title={scheme ? `Edit ${scheme.name}` : "New Scheme"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="scheme-form" loading={saving}>
            {scheme ? "Save" : "Create Scheme"}
          </Button>
        </>
      }
    >
      <form id="scheme-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Mancozeb 10+1 (Oct)" />
        </Field>
        <Field label="Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as SchemeType)}>
            {(Object.keys(TYPE_LABEL) as SchemeType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        {type === "BUY_X_GET_Y" ? (
          <>
            <Field label="Buy" required>
              <Input type="number" min="1" step="1" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="num" />
            </Field>
            <Field label="Get Free" required>
              <Input type="number" min="1" step="1" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="num" />
            </Field>
            <p className="self-end pb-2 text-xs text-slate-500">Free units go out of stock at zero price on the bill.</p>
          </>
        ) : type === "PCT_OFF" ? (
          <Field label="Discount %" required>
            <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="num" required />
          </Field>
        ) : (
          <Field label="₹ off per unit" required>
            <Input type="number" min="0" step="0.5" value={flat} onChange={(e) => setFlat(e.target.value)} className="num" required />
          </Field>
        )}
        <Field label="From" required>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To" hint="Blank = until switched off">
          <DateInput value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="Claim Back From the Company" checked={claimable} onChange={setClaimable} />
          <Checkbox label="Switched On" checked={isActive} onChange={setIsActive} />
        </div>
        <Field label="Products" required className="sm:col-span-3">
          <ProductPicker onPick={(p: Product) => setProducts((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, { id: p.id, name: p.name }]))} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {products.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-600/20">
                {p.name}
                <button type="button" onClick={() => setProducts((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {!products.length && <span className="text-xs text-slate-400">No products yet</span>}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Company circular no., conditions…" />
        </Field>
      </form>
    </Modal>
  );
}

function TypesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<CustomerType[]>("/customer-types", { all: "true" });
  const [editing, setEditing] = useState<CustomerType | null | "new">(null);

  async function remove(t: CustomerType) {
    if (!(await confirm(`Delete customer type "${t.name}"?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      const r = await api.del<{ deleted: boolean }>(`/customer-types/${t.id}`);
      toast.success(r.deleted ? "Deleted" : "Switched off (customers use it)");
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New Customer Type
        </Button>
      </div>
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th right>Discount</Th>
              <Th right>Only When Bill ≥</Th>
              <Th>Subsidised Fertiliser</Th>
              <Th right>Customers</Th>
              <Th>Status</Th>
              <ActionsTh />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data?.length ? (
              <EmptyRow colSpan={7}>No customer types yet — e.g. FPO 3% off, Bulk buyer 2% above ₹25,000</EmptyRow>
            ) : (
              data.map((t) => (
                <tr key={t.id} className={cx("hover:bg-slate-50", !t.isActive && "text-slate-400")}>
                  <Td className="font-medium text-slate-900">{t.name}</Td>
                  <Td right>{n(t.discountPct)}%</Td>
                  <Td right>{n(t.minBill) > 0 ? inr(t.minBill) : "—"}</Td>
                  <Td className="text-xs">{t.excludeSubsidised ? "Excluded" : "Included"}</Td>
                  <Td right>{t._count?.customers ?? 0}</Td>
                  <Td>{t.isActive ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</Td>
                  <ActionsTd>
                    <RowAction kind="edit" title={`Edit ${t.name}`} onClick={() => setEditing(t)} />
                    <RowAction kind="delete" title={`Delete ${t.name}`} onClick={() => remove(t)} />
                  </ActionsTd>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
      {editing && (
        <TypeForm
          type={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

function TypeForm({ type, onClose, onSaved }: { type: CustomerType | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(type?.name ?? "");
  const [pct, setPct] = useState(type ? String(n(type.discountPct)) : "");
  const [minBill, setMinBill] = useState(type ? String(n(type.minBill)) : "0");
  const [excl, setExcl] = useState(type?.excludeSubsidised ?? true);
  const [isActive, setIsActive] = useState(type?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: name.trim(), discountPct: Number(pct) || 0, minBill: Number(minBill) || 0, excludeSubsidised: excl, isActive };
      if (type) await api.patch(`/customer-types/${type.id}`, body);
      else await api.post("/customer-types", body);
      toast.success(type ? "Customer type updated" : "Customer type created");
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
      title={type ? `Edit ${type.name}` : "New Customer Type"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="type-form" loading={saving}>
            {type ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="type-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. FPO member" />
        </Field>
        <Field label="Discount %" required>
          <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="num" required />
        </Field>
        <Field label="Only When Bill ≥ ₹" hint="0 = always">
          <Input type="number" min="0" step="100" value={minBill} onChange={(e) => setMinBill(e.target.value)} className="num" />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <Checkbox label="Do Not Discount Govt-Subsidised Fertiliser" checked={excl} onChange={setExcl} />
          <Checkbox label="Switched On" checked={isActive} onChange={setIsActive} />
        </div>
      </form>
    </Modal>
  );
}
