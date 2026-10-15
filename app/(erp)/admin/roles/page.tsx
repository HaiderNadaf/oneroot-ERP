"use client";

import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { RoleTemplateForm } from "@/components/RoleTemplateForm";
import { Badge, Button, Card, Checkbox, EmptyRow, ErrorBox, Input, PageHeader, Spinner, StatusBadge, Table, Td, Th, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { clearApiCache, useApi } from "@/lib/hooks";
import { PERMISSIONS } from "@/lib/permissions";
import type { Role, RoleLimit, RoleTemplate } from "@/lib/types";

type Draft = { maxDiscountPct: string; returnLimit: string; adjustmentLimit: string; seeCostPrice: boolean };
const toDraft = (l: RoleLimit): Draft => ({
  maxDiscountPct: l.maxDiscountPct === null ? "" : String(l.maxDiscountPct),
  returnLimit: l.returnLimit === null ? "" : String(l.returnLimit),
  adjustmentLimit: l.adjustmentLimit === null ? "" : String(l.adjustmentLimit),
  seeCostPrice: l.seeCostPrice,
});
const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

export default function RolesPage() {
  return (
    <RequirePerm perms={["admin.roles"]}>
      <Roles />
      <CustomRoles />
    </RequirePerm>
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
      toast.success(`${roleName(l.role)} limits saved`);
      setDrafts((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== l.role)));
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner page />;

  return (
    <>
      <PageHeader title="Roles & authority limits" subtitle="Each built-in role gets a ceiling. Anything above it needs a manager's PIN at the counter or an approval from the inbox. Blank = no limit. Your own roles below inherit the ceilings of the role they are based on." />
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
          <p>Approvers need an approval PIN to sign off at the counter — set it in Users. Every override is logged with who asked, who approved and when.</p>
        </div>
      </Card>
    </>
  );
}

/** The store's own roles: a named set of permission ticks, reusable across users */
function CustomRoles() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<RoleTemplate[]>("/roles/custom");
  const [form, setForm] = useState<{ open: boolean; template: RoleTemplate | null }>({ open: false, template: null });
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(t: RoleTemplate) {
    if (!(await confirm(`Delete the role "${t.name}"? Nobody has it, so nothing else changes.`, { confirmLabel: "Delete", danger: true }))) return;
    setRemoving(t.id);
    try {
      await api.del(`/roles/custom/${t.id}`);
      clearApiCache("/roles/custom");
      toast.success(`Role "${t.name}" deleted`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card
      title="Your roles"
      className="mt-4"
      bodyClassName="p-0"
      actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, template: null })}>
          New role
        </Button>
      }
    >
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Money limits</Th>
              <Th>Permissions</Th>
              <Th right>Users</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <Td colSpan={6}>
                  <Spinner />
                </Td>
              </tr>
            ) : !data?.length ? (
              <EmptyRow colSpan={6}>No custom roles yet — make one to reuse a set of ticks for several staff (e.g. Store supervisor, Billing clerk)</EmptyRow>
            ) : (
              data.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-medium text-slate-900">{t.name}</span>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  </Td>
                  <Td className="text-sm">{t.department?.name ?? <span className="text-xs text-slate-400">none</span>}</Td>
                  <Td>
                    <StatusBadge status={t.baseRole} />
                  </Td>
                  <Td>
                    <span className="num text-sm">
                      {t.permissions.length} of {PERMISSIONS.length}
                    </span>
                    <p className="max-w-md truncate text-xs text-slate-500" title={t.permissions.map((k) => PERMISSIONS.find((p) => p.key === k)?.label ?? k).join(" · ")}>
                      {t.permissions
                        .slice(0, 4)
                        .map((k) => PERMISSIONS.find((p) => p.key === k)?.label.split(" (")[0] ?? k)
                        .join(" · ")}
                      {t.permissions.length > 4 ? " …" : ""}
                    </p>
                  </Td>
                  <Td right>{t.userCount ? <Badge tone="blue">{t.userCount}</Badge> : <span className="text-xs text-slate-400">none</span>}</Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setForm({ open: true, template: t })}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} loading={removing === t.id} disabled={t.userCount > 0} onClick={() => remove(t)} aria-label="Delete role" />
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {form.open && (
        <RoleTemplateForm
          template={form.template}
          onClose={() => setForm({ open: false, template: null })}
          onSaved={() => {
            setForm({ open: false, template: null });
            void reload();
          }}
        />
      )}
    </Card>
  );
}
