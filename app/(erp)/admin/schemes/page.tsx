"use client";

import { PackageMinus, PartyPopper, Plus, Tag, Tags } from "lucide-react";
// import Link from "next/link"; // only used for the disabled Campaigns link
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { SchemeForm, dayOf } from "@/components/SchemeForm";
import { ActionsTd, ActionsTh, Badge, Button, Card, Checkbox, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, RowAction, Select, StatCard, Table, Tabs, Td, Th, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { describeScheme, offerConditions, offerCoverage, offerTypeName, purposeName, purposeTone } from "@/lib/offers";
import { remainingOf } from "@/lib/pricing";
import type { CustomerType, OfferPurpose, Scheme, SchemeOptions } from "@/lib/types";

type Tab = "schemes" | "types";

/** Page header for each tab */
const HEADER: Record<Tab, { title: string; subtitle: string }> = {
  schemes: {
    title: "Offers & Schemes",
    subtitle: "Festival offers, stock clearance, company schemes and more apply by themselves at the counter (one per line, the best for the farmer)",
  },
  types: {
    title: "Customer Types",
    subtitle: "Customer groups with a fixed discount (e.g. FPO 3%, bulk buyer 2% above ₹25,000), added on top of any offer at the counter",
  },
};

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
      <PageHeader {...HEADER[tab]} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "schemes", label: "Offers & Schemes" },
          { value: "types", label: "Customer Types" },
        ]}
      />
      {tab === "schemes" ? <SchemesTab /> : <TypesTab />}
    </>
  );
}

function SchemesTab() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("all");
  const [purpose, setPurpose] = useState("");
  const { data: options } = useApi<SchemeOptions>("/scheme-options");
  const [editing, setEditing] = useState<{ scheme: Scheme | null; purpose?: OfferPurpose } | null>(null);
  const { data: all, error, loading, reload } = useApi<Scheme[]>("/schemes", { status });
  const now = today();
  const data = purpose ? all?.filter((s) => s.purposeId === purpose) : all;

  const isRunning = (s: Scheme) => s.isActive && dayOf(s.from) <= now && (!s.to || dayOf(s.to) >= now);
  const running = (all ?? []).filter(isRunning);
  const stats = {
    running: running.length,
    festival: running.filter((s) => s.purposeOption?.code === "FESTIVAL").length,
    clearance: running.filter((s) => s.purposeOption?.code === "STOCK_CLEARANCE").length,
    scheduled: (all ?? []).filter((s) => s.isActive && dayOf(s.from) > now).length,
  };

  async function remove(s: Scheme) {
    if (!(await confirm(`Delete offer "${s.name}"? Bills that used it still show it.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/schemes/${s.id}`);
      toast.success("Offer deleted");
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Running Today" value={stats.running} icon={<Tags />} tone="green" sub="Showing at the counter" />
        <StatCard label="Festival Offers" value={stats.festival} icon={<PartyPopper />} tone="amber" sub="Running today" />
        <StatCard label="Stock Clearance" value={stats.clearance} icon={<PackageMinus />} tone="red" sub="Running today" />
        <StatCard label="Scheduled" value={stats.scheduled} icon={<Tag />} tone="blue" sub="Start on a later date" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Filter by status">
          <option value="all">All Offers</option>
          <option value="active">Running Today</option>
          <option value="">Switched On</option>
        </Select>
        <Select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Filter by purpose">
          <option value="">Every Purpose</option>
          {options?.purposes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        {can("schemes.create") && (
          <>
            <Button variant="secondary" icon={<PartyPopper className="size-4" />} onClick={() => setEditing({ scheme: null, purpose: "FESTIVAL" })}>
              Festival Offer
            </Button>
            <Button variant="secondary" icon={<PackageMinus className="size-4" />} onClick={() => setEditing({ scheme: null, purpose: "STOCK_CLEARANCE" })}>
              Stock Clearance
            </Button>
            <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setEditing({ scheme: null })}>
              New Offer
            </Button>
          </>
        )}
      </div>
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Offer</Th>
              <Th>Gives</Th>
              <Th>Applies To</Th>
              <Th>Conditions</Th>
              <Th>Period</Th>
              <Th>Claim</Th>
              <Th right>Used On</Th>
              <Th>Status</Th>
              <ActionsTh />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={9} />
            ) : !data?.length ? (
              <EmptyRow colSpan={9}>No offers yet — add a festival offer, a stock clearance or the company schemes you pass on to farmers</EmptyRow>
            ) : (
              data.map((s) => {
                const soldOut = s.maxQty !== null && s.maxQty !== undefined && remainingOf(s) <= 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {s.name}
                        <Badge tone={purposeTone(s)}>{purposeName(s)}</Badge>
                      </span>
                      {(s.occasion || s.campaign) && <p className="text-xs font-normal text-amber-700">{[s.occasion, s.campaign?.name].filter(Boolean).join(" · ")}</p>}
                      {s.notes && <p className="text-xs font-normal text-slate-500">{s.notes}</p>}
                    </Td>
                    <Td className="whitespace-nowrap font-medium">
                      {describeScheme(s)}
                      {s.offerType && s.offerType.name !== describeScheme(s) && <p className="text-xs font-normal text-slate-500">{offerTypeName(s)}</p>}
                    </Td>
                    <Td className="max-w-xs text-xs text-slate-600">
                      {s.scope !== "PRODUCTS" && <span className="mr-1 font-semibold text-slate-700">{s.scope === "ALL" ? "Store-wide:" : "Categories:"}</span>}
                      {offerCoverage(s)}
                    </Td>
                    <Td className="text-xs text-slate-600">{offerConditions(s) || <span className="text-slate-400">—</span>}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {date(s.from)} – {s.to ? date(s.to) : "open"}
                    </Td>
                    <Td>{s.claimable ? <Badge tone="blue">From Company</Badge> : <Badge>Own Cost</Badge>}</Td>
                    <Td right>{s._count?.saleItems ?? 0} lines</Td>
                    <Td>
                      {!s.isActive ? (
                        <Badge>Off</Badge>
                      ) : soldOut ? (
                        <Badge tone="red">Stock Limit Reached</Badge>
                      ) : isRunning(s) ? (
                        <Badge tone="green">Running</Badge>
                      ) : dayOf(s.from) > now ? (
                        <Badge tone="amber">Scheduled</Badge>
                      ) : (
                        <Badge>Ended</Badge>
                      )}
                    </Td>
                    <ActionsTd>
                      {can("schemes.edit") && <RowAction kind="edit" title={`Edit ${s.name}`} onClick={() => setEditing({ scheme: s })} />}
                      {can("schemes.delete") && <RowAction kind="delete" title={`Delete ${s.name}`} onClick={() => remove(s)} />}
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
          scheme={editing.scheme}
          purpose={editing.purpose}
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

function TypesTab() {
  const { can } = useAuth();
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
        {can("schemes.create") && (
          <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New Customer Type
          </Button>
        )}
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
                    {can("schemes.edit") && <RowAction kind="edit" title={`Edit ${t.name}`} onClick={() => setEditing(t)} />}
                    {can("schemes.delete") && <RowAction kind="delete" title={`Delete ${t.name}`} onClick={() => remove(t)} />}
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
