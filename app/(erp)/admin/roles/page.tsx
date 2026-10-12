"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { RequireRole } from "@/components/AppShell";
import { Button, Card, Checkbox, ErrorBox, Input, PageHeader, Spinner, StatusBadge, Table, Td, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Role, RoleLimit } from "@/lib/types";

type Draft = { maxDiscountPct: string; returnLimit: string; adjustmentLimit: string; seeCostPrice: boolean };
const toDraft = (l: RoleLimit): Draft => ({
  maxDiscountPct: l.maxDiscountPct === null ? "" : String(l.maxDiscountPct),
  returnLimit: l.returnLimit === null ? "" : String(l.returnLimit),
  adjustmentLimit: l.adjustmentLimit === null ? "" : String(l.adjustmentLimit),
  seeCostPrice: l.seeCostPrice,
});

export default function RolesPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Roles />
    </RequireRole>
  );
}

function Roles() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<RoleLimit[]>("/roles/limits");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const draftOf = (l: RoleLimit) => drafts[l.role] ?? toDraft(l);
  const set = (l: RoleLimit, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [l.role]: { ...draftOf(l), ...patch } }));
  const dirty = (l: RoleLimit) => JSON.stringify(draftOf(l)) !== JSON.stringify(toDraft(l));

  async function save(l: RoleLimit) {
    const d = draftOf(l);
    setSaving(l.role);
    try {
      await api.put(`/roles/limits/${l.role}`, {
        maxDiscountPct: d.maxDiscountPct === "" ? null : Number(d.maxDiscountPct),
        returnLimit: d.returnLimit === "" ? null : Number(d.returnLimit),
        adjustmentLimit: d.adjustmentLimit === "" ? null : Number(d.adjustmentLimit),
        seeCostPrice: d.seeCostPrice,
      });
      toast.success(`${l.role.charAt(0) + l.role.slice(1).toLowerCase()} limits saved`);
      setDrafts((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== l.role)));
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;

  return (
    <>
      <PageHeader title="Roles & authority limits" subtitle="Each role gets a ceiling. Anything above it needs a manager's PIN at the counter or an approval from the inbox. Blank = no limit." />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th right>Max discount %</Th>
              <Th right>Return / refund up to ₹</Th>
              <Th right>Stock adjustment up to ₹</Th>
              <Th>See cost price</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((l) => {
              const d = draftOf(l);
              const admin = l.role === ("ADMIN" as Role);
              return (
                <tr key={l.role} className="hover:bg-slate-50">
                  <Td>
                    <StatusBadge status={l.role} />
                    <p className="mt-1 text-xs text-slate-500">
                      {l.role === "ADMIN" ? "Owner — approves everyone, no limits" : l.role === "MANAGER" ? "Approves cashiers by PIN or from the inbox" : l.role === "CASHIER" ? "Counter billing and receipts" : "Books, payments, reports"}
                    </p>
                  </Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" max="100" step="0.5" value={d.maxDiscountPct} placeholder="no limit" onChange={(e) => set(l, { maxDiscountPct: e.target.value })} className="num h-8 w-24 text-right" />}</Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" step="100" value={d.returnLimit} placeholder="no limit" onChange={(e) => set(l, { returnLimit: e.target.value })} className="num h-8 w-32 text-right" />}</Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" step="100" value={d.adjustmentLimit} placeholder="no limit" onChange={(e) => set(l, { adjustmentLimit: e.target.value })} className="num h-8 w-32 text-right" />}</Td>
                  <Td>{admin ? "Yes" : <Checkbox label="" checked={d.seeCostPrice} onChange={(v) => set(l, { seeCostPrice: v })} />}</Td>
                  <Td right>
                    {!admin && (
                      <Button size="sm" icon={<Save className="size-4" />} disabled={!dirty(l)} loading={saving === l.role} onClick={() => save(l)}>
                        Save
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <div className="space-y-1 px-4 py-3 text-xs text-slate-500">
          <p>Cash or UPI refunds always need approval for a role that has a return limit (only credit notes are within a cashier&apos;s own authority).</p>
          <p>Managers and the owner need an approval PIN to sign off at the counter — set it in Users. Every override is logged with who asked, who approved and when.</p>
        </div>
      </Card>
    </>
  );
}
