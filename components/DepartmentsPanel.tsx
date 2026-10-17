"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { clearApiCache, useApi } from "@/lib/hooks";
import type { Department, RoleTemplate } from "@/lib/types";
import { useCanGrantAll } from "./PermissionPicker";
import { Button, Card, Field, Input, Modal, RowAction, Spinner, errMsg, useConfirm, useToast } from "./ui";

/**
 * Departments (Procurement, Sales, Warehouse...) and the roles that sit inside each one.
 * Roles are edited by clicking them; "+ Role" starts a new role in that department.
 */
export function DepartmentsPanel({
  templates,
  canManage,
  onNewRole,
  onEditRole,
  onChanged,
}: {
  templates: RoleTemplate[];
  canManage: boolean;
  onNewRole: (departmentId: string | null) => void;
  onEditRole: (t: RoleTemplate) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const deps = useApi<Department[]>("/departments");
  const [form, setForm] = useState<{ department: Department | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reloadAll = () => {
    clearApiCache("/departments");
    void deps.reload();
    onChanged();
  };

  async function remove(d: Department) {
    if (!(await confirm(`Delete the department "${d.name}"? Nothing else changes.`, { confirmLabel: "Delete", danger: true }))) return;
    setBusy(d.id);
    try {
      await api.del(`/departments/${d.id}`);
      toast.success(`"${d.name}" deleted`);
      reloadAll();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const loose = templates.filter((t) => !t.departmentId);

  return (
    <>
      <Card
        title="Departments"
        className="mt-4"
        bodyClassName="p-0"
        actions={
          canManage && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ department: null })}>
              New Department
            </Button>
          )
        }
      >
        {deps.loading && !deps.data ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : !deps.data?.length && !loose.length ? (
          <p className="p-4 text-sm text-slate-500">No departments yet. Create one, then add roles inside it.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {(deps.data ?? []).map((d) => {
              const roles = templates.filter((t) => t.departmentId === d.id);
              return (
                <Section
                  key={d.id}
                  title={d.name}
                  description={d.description}
                  roles={roles}
                  canManage={canManage}
                  onEditRole={onEditRole}
                  onAddRole={() => onNewRole(d.id)}
                  onEdit={() => setForm({ department: d })}
                  onDelete={() => remove(d)}
                  deleteDisabled={d.roleCount > 0 || busy === d.id}
                  deleteHint={d.roleCount > 0 ? "Move or delete its roles first" : "Delete department"}
                />
              );
            })}
            {loose.length > 0 && (
              <Section title="No Department" roles={loose} canManage={canManage} onEditRole={onEditRole} onAddRole={() => onNewRole(null)} />
            )}
          </div>
        )}
      </Card>
      {form && (
        <DepartmentForm
          department={form.department}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reloadAll();
          }}
        />
      )}
    </>
  );
}

function Section({
  title,
  description,
  roles,
  canManage,
  onEditRole,
  onAddRole,
  onEdit,
  onDelete,
  deleteDisabled,
  deleteHint,
}: {
  title: string;
  description?: string | null;
  roles: RoleTemplate[];
  canManage: boolean;
  onEditRole: (t: RoleTemplate) => void;
  onAddRole: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteHint?: string;
}) {
  const canGrantAll = useCanGrantAll();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={onAddRole}>
              Role
            </Button>
            {onEdit && <RowAction kind="edit" title="Edit department" onClick={onEdit} />}
            {onDelete && <RowAction kind="delete" title={deleteHint ?? "Delete department"} disabled={deleteDisabled} onClick={onDelete} />}
          </div>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {roles.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              disabled={!canManage || !canGrantAll(t.permissions)}
              onClick={() => onEditRole(t)}
              className="flex w-full flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="text-sm font-medium text-slate-800">{t.name}</span>
              <span className="text-xs text-slate-500">
                {t.permissions.length} permissions · {t.userCount} user{t.userCount === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        ))}
        {!roles.length && <li className="px-2 py-1 text-xs text-slate-400">No roles yet</li>}
      </ul>
    </div>
  );
}

function DepartmentForm({ department, onClose, onSaved }: { department: Department | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(department?.name ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || undefined };
      if (department) await api.put(`/departments/${department.id}`, body);
      else await api.post("/departments", body);
      toast.success(department ? "Department updated" : `"${name.trim()}" created`);
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
      title={department ? `Edit ${department.name}` : "New Department"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" loading={saving}>
            {department ? "Save" : "Create Department"}
          </Button>
        </>
      }
    >
      <form id="department-form" onSubmit={save} className="grid gap-3">
        <Field label="Department Name" required hint="e.g. Procurement, Sales, Warehouse, Accounts, IT">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this department does" />
        </Field>
      </form>
    </Modal>
  );
}
