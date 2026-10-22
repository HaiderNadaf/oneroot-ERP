"use client";

import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { n } from "@/lib/format";
import { clearApiCache, useApi } from "@/lib/hooks";
import type { CustomerType } from "@/lib/types";
import { Badge, Button, Card, Checkbox, EmptyRow, ErrorBox, Input, LoadingRow, Table, Td, Th, errMsg, useToast } from "./ui";

type Draft = { discountPct: string; minBill: string; excludeSubsidised: boolean; isActive: boolean };
const toDraft = (t: CustomerType): Draft => ({
  discountPct: String(n(t.discountPct)),
  minBill: String(n(t.minBill)),
  excludeSubsidised: t.excludeSubsidised,
  isActive: t.isActive,
});
const TYPE_LABEL: Record<string, string> = { FPO: "FPO (Farmer Producer Organisation)" };

/**
 * POS discounts by customer type. Picking a customer at the counter applies their type's discount
 * (after schemes); a bill without a customer uses the "Walk-in Customer" row.
 */
export function CustomerTypeDiscounts() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<CustomerType[]>("/customer-types", { all: "true" });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const draftOf = (t: CustomerType) => drafts[t.id] ?? toDraft(t);
  const set = (t: CustomerType, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [t.id]: { ...draftOf(t), ...patch } }));
  const dirty = (t: CustomerType) => JSON.stringify(draftOf(t)) !== JSON.stringify(toDraft(t));

  const refresh = () => {
    clearApiCache("/customer-types");
    void reload();
  };

  async function save(t: CustomerType) {
    const d = draftOf(t);
    const pct = Number(d.discountPct);
    const min = d.minBill === "" ? 0 : Number(d.minBill);
    if (!(pct >= 0 && pct <= 100)) return toast.error("Discount must be between 0 and 100%");
    if (!(min >= 0)) return toast.error("Minimum bill cannot be negative");
    setSaving(t.id);
    try {
      await api.patch(`/customer-types/${t.id}`, { discountPct: pct, minBill: min, excludeSubsidised: d.excludeSubsidised, isActive: d.isActive });
      toast.success(`${t.name}: ${pct}% discount saved`);
      setDrafts((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== t.id)));
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) return toast.error("Enter the customer type name");
    setAdding(true);
    try {
      await api.post("/customer-types", { name, discountPct: 0 });
      toast.success(`"${name}" added — set its discount below`);
      setNewName("");
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card title="POS · Customer-Type Discounts" className="mt-4" bodyClassName="p-0">
      <p className="px-4 pt-3 text-xs text-slate-500">
        When a customer is picked at the counter, their customer type&apos;s discount is applied automatically, after any company scheme.
        A bill with no customer selected uses the <b className="font-medium text-slate-700">Walk-in Customer</b> discount. Set 0% for no discount.
      </p>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Customer Type</Th>
              <Th right>Discount %</Th>
              <Th right>Only on Bills Above ₹</Th>
              <Th>Skip Subsidised Fertiliser</Th>
              <Th>Active</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={6} />
            ) : !data?.length ? (
              <EmptyRow colSpan={6}>No customer types yet</EmptyRow>
            ) : (
              data.map((t) => {
                const d = draftOf(t);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td>
                      <span className="font-medium text-slate-900">{TYPE_LABEL[t.name] ?? t.name}</span>
                      {t._count && <span className="ml-2 text-xs text-slate-500">{t._count.customers} customer{t._count.customers === 1 ? "" : "s"}</span>}
                      {!t.isActive && (
                        <span className="ml-2">
                          <Badge>Inactive</Badge>
                        </span>
                      )}
                    </Td>
                    <Td right>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={d.discountPct}
                        onChange={(e) => set(t, { discountPct: e.target.value })}
                        className="num h-8 w-24 text-right"
                        aria-label={`${t.name} discount %`}
                      />
                    </Td>
                    <Td right>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={d.minBill}
                        placeholder="0"
                        onChange={(e) => set(t, { minBill: e.target.value })}
                        className="num h-8 w-32 text-right"
                        aria-label={`${t.name} minimum bill`}
                      />
                    </Td>
                    <Td>
                      <Checkbox label="" checked={d.excludeSubsidised} onChange={(v) => set(t, { excludeSubsidised: v })} />
                    </Td>
                    <Td>
                      <Checkbox label="" checked={d.isActive} onChange={(v) => set(t, { isActive: v })} />
                    </Td>
                    <Td right>
                      {can("schemes.edit") && (
                        <Button size="sm" icon={<Save className="size-4" />} disabled={!dirty(t)} loading={saving === t.id} onClick={() => save(t)}>
                          Save
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      {can("schemes.create") && (
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New customer type, e.g. Institution" className="h-9 w-72" />
        <Button type="submit" size="sm" variant="secondary" icon={<Plus className="size-4" />} loading={adding}>
          Add Type
        </Button>
      </form>
      )}
    </Card>
  );
}
