"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { clearApiCache, useApi } from "@/lib/hooks";
import { normalizePermissions, type Permission } from "@/lib/permissions";
import type { Department, Role, RoleTemplate } from "@/lib/types";
import { PermissionPicker } from "./PermissionPicker";
import { Button, Field, Input, Modal, Select, errMsg, useToast } from "./ui";

/** Which built-in role's money limits (Roles & Limits) this role shares */
const LIMIT_ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "CASHIER", label: "Cashier limits", hint: "Smallest discount / refund / adjustment allowed without approval" },
  { value: "ACCOUNTANT", label: "Accountant limits", hint: "The accountant's discount / refund / adjustment amounts" },
  { value: "MANAGER", label: "Manager limits", hint: "Largest amounts; pick this for heads who approve others" },
];

/**
 * Create or edit a role inside a department: a name plus exactly the ticks it may do.
 * Opened from a department's "+ Role" button the department is fixed; otherwise it must be chosen.
 */
export function RoleTemplateForm({
  template,
  initialDepartmentId,
  onClose,
  onSaved,
}: {
  template: RoleTemplate | null;
  /** Department the role is being made in (from its "+ Role" button) */
  initialDepartmentId?: string | null;
  onClose: () => void;
  onSaved: (saved: RoleTemplate) => void;
}) {
  const toast = useToast();
  const editing = !!template;
  const departments = useApi<Department[]>("/departments");
  // Made from a department's own button: no need to ask again
  const fixedDepartment = !editing && !!initialDepartmentId;
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [departmentId, setDepartmentId] = useState<string>(template?.departmentId ?? initialDepartmentId ?? "");
  const [baseRole, setBaseRole] = useState<Role>(template?.baseRole ?? "CASHIER");
  // A new role starts empty: tick exactly what it may do
  const [permissions, setPermissions] = useState<Permission[]>(() => (template ? normalizePermissions(template.permissions) : []));
  const [saving, setSaving] = useState(false);
  const inUse = (template?.userCount ?? 0) > 0;
  const departmentName = departments.data?.find((d) => d.id === departmentId)?.name ?? template?.department?.name;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Give the role a name");
    if (!departmentId) return toast.error("Choose the department this role belongs to");
    if (!permissions.length) return toast.error("Tick at least one thing this role may do");
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        departmentId,
        baseRole,
        permissions,
      };
      const saved = editing ? await api.put<RoleTemplate>(`/roles/custom/${template.id}`, body) : await api.post<RoleTemplate>("/roles/custom", body);
      clearApiCache("/roles/custom");
      clearApiCache("/departments");
      clearApiCache("/users");
      toast.success(
        editing
          ? `${saved.name} updated${inUse ? ` for ${template.userCount} user${template.userCount > 1 ? "s" : ""}` : ""}`
          : `Role "${saved.name}" created${departmentName ? ` in ${departmentName}` : ""}`,
      );
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? `Edit role: ${template.name}` : fixedDepartment ? `New role in ${departmentName ?? "department"}` : "New role";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="role-template-form" loading={saving}>
            {editing ? "Save role" : "Create role"}
          </Button>
        </>
      }
    >
      <form id="role-template-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Role name" required hint="e.g. Category Head, Manager, Intern" className={fixedDepartment ? "sm:col-span-2" : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus minLength={2} />
        </Field>
        {!fixedDepartment && (
          <Field label="Department" required>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
              <option value="" disabled>
                {departments.loading ? "Loading departments…" : departments.error ? "Could not load departments" : "Choose a department"}
              </option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Description" className="sm:col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role does (optional)" />
        </Field>
        <PermissionPicker value={permissions} onChange={setPermissions} defaults={template ? normalizePermissions(template.permissions) : permissions} />
        <Field
          label="Discount, refund and stock-adjustment limits"
          className="sm:col-span-2"
          hint={`${LIMIT_ROLES.find((b) => b.value === baseRole)?.hint}. The amounts themselves are set in Roles & Limits.`}
        >
          <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value as Role)}>
            {LIMIT_ROLES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        {editing && inUse && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            The {template.userCount} user{template.userCount > 1 ? "s" : ""} with this role follow the change; anything ticked or unticked for one
            of them personally stays as it is.
          </p>
        )}
      </form>
    </Modal>
  );
}
