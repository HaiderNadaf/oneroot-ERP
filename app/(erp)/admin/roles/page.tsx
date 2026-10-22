"use client";

import { Plus, Save } from "lucide-react";
import { PermissionPicker, useCanGrantAll } from "@/components/PermissionPicker";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { RoleTemplateForm } from "@/components/RoleTemplateForm";
import { ActionsTd, ActionsTh, Badge, Button, Card, Checkbox, EmptyRow, ErrorBox, Input, Modal, PageHeader, RowAction, Spinner, StatusBadge, Table, Td, Th, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearApiCache, useApi } from "@/lib/hooks";
import { PERMISSIONS, normalizePermissions, type Permission } from "@/lib/permissions";
import type { BuiltInRole, Role, RoleLimit, RoleTemplate } from "@/lib/types";

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
      <BuiltInRoles />
      <CustomRoles />
    </RequirePerm>
  );
}

function Roles() {
  const { can } = useAuth();
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
      <PageHeader title="Roles & Authority Limits" subtitle="Each built-in role gets a ceiling. Anything above it needs a manager's PIN at the counter or an approval from the inbox. Blank = no limit. Your own roles below inherit the ceilings of the role they are based on." />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th right>Max Discount %</Th>
              <Th right>Return / Refund Up To ₹</Th>
              <Th right>Stock Adjustment Up To ₹</Th>
              <Th>See Cost Price</Th>
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
                    <p className="mt-1 text-xs text-slate-500 max-sm:min-w-40">
                      {l.role === "ADMIN" ? "Owner — approves everyone, no limits" : l.role === "MANAGER" ? "Approves cashiers by PIN or from the inbox" : l.role === "CASHIER" ? "Counter billing and receipts" : "Books, payments, reports"}
                    </p>
                  </Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" max="100" step="0.5" value={d.maxDiscountPct} placeholder="No limit" onChange={(e) => set(l, { maxDiscountPct: e.target.value })} className="num h-8 w-24 text-right" />}</Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" step="100" value={d.returnLimit} placeholder="No limit" onChange={(e) => set(l, { returnLimit: e.target.value })} className="num h-8 w-28 text-right sm:w-32" />}</Td>
                  <Td right>{admin ? "Any" : <Input type="number" min="0" step="100" value={d.adjustmentLimit} placeholder="No limit" onChange={(e) => set(l, { adjustmentLimit: e.target.value })} className="num h-8 w-28 text-right sm:w-32" />}</Td>
                  <Td>{admin ? "Yes" : <Checkbox label="" checked={d.seeCostPrice} onChange={(v) => set(l, { seeCostPrice: v })} />}</Td>
                  <Td right>
                    {!admin && can("roles.edit") && (
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

/** Short list of what a set of permissions covers, for a table cell */
function PermissionSummary({ keys }: { keys: string[] }) {
  const label = (k: string) => PERMISSIONS.find((p) => p.key === k)?.label ?? k;
  return (
    <>
      <span className="num text-sm">
        {keys.length} of {PERMISSIONS.length}
      </span>
      <p className="max-w-48 truncate text-xs text-slate-500 sm:max-w-md" title={keys.map(label).join(" · ")}>
        {keys
          .slice(0, 4)
          .map((k) => label(k).split(" (")[0])
          .join(" · ")}
        {keys.length > 4 ? " …" : ""}
      </p>
    </>
  );
}

/** What Manager / Accountant / Cashier may open: everyone on the role follows it, plus their own extras / removals */
function BuiltInRoles() {
  const { can } = useAuth();
  const canGrantAll = useCanGrantAll();
  const { data, error, loading, reload } = useApi<BuiltInRole[]>("/roles/built-in");
  const [editing, setEditing] = useState<BuiltInRole | null>(null);

  return (
    <Card title="Role Permissions" className="mt-4" bodyClassName="p-0">
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Can Open</Th>
              <Th right>Users</Th>
              <ActionsTh />
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-slate-50">
              <Td>
                <StatusBadge status="ADMIN" />
              </Td>
              <Td className="text-sm text-slate-600">Everything, always — cannot be limited</Td>
              <Td right />
              <ActionsTd />
            </tr>
            {loading && !data ? (
              <tr>
                <Td colSpan={4}>
                  <Spinner />
                </Td>
              </tr>
            ) : (
              (data ?? []).map((r) => {
                const changed = normalizePermissions(r.permissions).join() !== normalizePermissions(r.defaults).join();
                return (
                  <tr key={r.role} className="hover:bg-slate-50">
                    <Td>
                      <StatusBadge status={r.role} />
                      {changed && (
                        <span className="ml-1.5 align-middle">
                          <Badge tone="amber">changed</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <PermissionSummary keys={r.permissions} />
                    </Td>
                    <Td right>{r.userCount ? <Badge tone="blue">{r.userCount}</Badge> : <span className="text-xs text-slate-400">none</span>}</Td>
                    <ActionsTd>
                      {canGrantAll(r.permissions) && can("roles.edit") && (
                        <RowAction kind="edit" title={`Edit ${roleName(r.role)} permissions`} onClick={() => setEditing(r)} />
                      )}
                    </ActionsTd>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      <p className="px-4 py-3 text-xs text-slate-500">
        The sidebar, every page and the API follow the role. Extra or removed permissions for one person are set in Users and stay with
        them when the role changes.
      </p>
      {editing && (
        <BuiltInRoleForm
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Card>
  );
}

function BuiltInRoleForm({ role, onClose, onSaved }: { role: BuiltInRole; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [permissions, setPermissions] = useState<Permission[]>(() => normalizePermissions(role.permissions));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!permissions.length) return toast.error("Tick at least one thing this role may do");
    setSaving(true);
    try {
      await api.put(`/roles/built-in/${role.role}`, { permissions });
      clearApiCache("/roles/built-in");
      clearApiCache("/users");
      toast.success(`${roleName(role.role)} permissions saved${role.userCount ? ` for ${role.userCount} user${role.userCount > 1 ? "s" : ""}` : ""}`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${roleName(role.role)} Permissions`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save Role
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PermissionPicker
          value={permissions}
          onChange={setPermissions}
          defaults={normalizePermissions(role.defaults)}
          resetLabel={`Reset to Standard ${roleName(role.role)}`}
        />
        <p className="text-xs text-slate-500 sm:col-span-2">
          {role.userCount
            ? `The ${role.userCount} user${role.userCount > 1 ? "s" : ""} on this role follow the change at their next page load; anything ticked or unticked for one of them personally stays.`
            : "Nobody has this role yet."}{" "}
          &ldquo;extra&rdquo; marks what the standard {roleName(role.role)} role does not include.
        </p>
      </div>
    </Modal>
  );
}

/** The store's own roles: a named set of permission ticks, reusable across users */
function CustomRoles() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canGrantAll = useCanGrantAll();
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
      title="Your Roles"
      className="mt-4"
      bodyClassName="p-0"
      actions={
        can("roles.create") && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, template: null })}>
            New Role
          </Button>
        )
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
              <Th>Money Limits</Th>
              <Th>Permissions</Th>
              <Th right>Users</Th>
              <ActionsTh />
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
                    <PermissionSummary keys={t.permissions} />
                  </Td>
                  <Td right>{t.userCount ? <Badge tone="blue">{t.userCount}</Badge> : <span className="text-xs text-slate-400">none</span>}</Td>
                  <ActionsTd>
                    {canGrantAll(t.permissions) && can("roles.edit") && <RowAction kind="edit" title={`Edit ${t.name}`} onClick={() => setForm({ open: true, template: t })} />}
                    {can("roles.delete") && (
                      <RowAction kind="delete" title={t.userCount > 0 ? `${t.name} is still assigned to users` : `Delete ${t.name}`} loading={removing === t.id} disabled={t.userCount > 0} onClick={() => remove(t)} />
                    )}
                  </ActionsTd>
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
