"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearApiCache, useApi } from "@/lib/hooks";
import { defaultsFor, hasPerm, normalizePermissions, type Permission } from "@/lib/permissions";
import type { Department, Role, RoleTemplate } from "@/lib/types";
import { PermissionPicker } from "./PermissionPicker";
import { Button, Checkbox, Field, Input, Modal, Select, errMsg, useToast } from "./ui";

const BASE_ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "CASHIER", label: "Cashier", hint: "Counter staff — cashier discount / refund ceilings apply" },
  { value: "ACCOUNTANT", label: "Accountant", hint: "Books and payments — accountant ceilings apply" },
  { value: "MANAGER", label: "Manager", hint: "Can approve others — manager ceilings apply" },
];

/**
 * Create or edit a custom role: a name plus a set of ticks. The base role only decides the
 * discount / refund / adjustment ceilings (Roles & Limits) and whether the role can hold a PIN.
 */
export function RoleTemplateForm({
  template,
  initialDepartmentId,
  onClose,
  onSaved,
}: {
  template: RoleTemplate | null;
  /** Department to start in when the role is made from a department */
  initialDepartmentId?: string | null;
  onClose: () => void;
  onSaved: (saved: RoleTemplate) => void;
}) {
  const toast = useToast();
  const { user: me } = useAuth();
  const editing = !!template;
  const departments = useApi<Department[]>("/departments");
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [departmentId, setDepartmentId] = useState<string>(template?.departmentId ?? initialDepartmentId ?? "");
  const [baseRole, setBaseRole] = useState<Role>(template?.baseRole ?? "CASHIER");
  const [permissions, setPermissions] = useState<Permission[]>(() =>
    template ? normalizePermissions(template.permissions) : defaultsFor("CASHIER").filter((k) => hasPerm(me, k)),
  );
  const [applyToUsers, setApplyToUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const inUse = (template?.userCount ?? 0) > 0;

  const changeBase = (r: Role) => {
    setBaseRole(r);
    // Start a new role from the base role's usual ticks; keep an existing role's ticks as they are
    if (!editing) setPermissions(defaultsFor(r).filter((k) => hasPerm(me, k)));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Give the role a name");
    if (!permissions.length) return toast.error("Tick at least one permission");
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        departmentId: departmentId || null,
        baseRole,
        permissions,
        applyToUsers: editing && inUse ? applyToUsers : undefined,
      };
      const saved = editing ? await api.put<RoleTemplate>(`/roles/custom/${template.id}`, body) : await api.post<RoleTemplate>("/roles/custom", body);
      clearApiCache("/roles/custom");
      clearApiCache("/users");
      toast.success(editing ? `${saved.name} updated${inUse && applyToUsers ? ` for ${template.userCount} user${template.userCount > 1 ? "s" : ""}` : ""}` : `Role "${saved.name}" created`);
      onSaved(saved);
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
      title={editing ? `Edit role: ${template.name}` : "New role"}
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
        <Field label="Role name" required hint="e.g. Store supervisor, Billing clerk, Purchase officer">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus minLength={2} />
        </Field>
        <Field label="Department" hint="Groups this role on the Users page">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">No department</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Based on" required hint={BASE_ROLES.find((b) => b.value === baseRole)?.hint}>
          <Select value={baseRole} onChange={(e) => changeBase(e.target.value as Role)}>
            {BASE_ROLES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for (shown in the role picker)" />
        </Field>
        <PermissionPicker value={permissions} onChange={setPermissions} defaults={defaultsFor(baseRole)} resetLabel={`Reset to ${BASE_ROLES.find((b) => b.value === baseRole)?.label} defaults`} />
        {editing && inUse && (
          <div className="sm:col-span-2">
            <Checkbox
              label={`Also update the ${template.userCount} user${template.userCount > 1 ? "s" : ""} who have this role to these ticks`}
              checked={applyToUsers}
              onChange={setApplyToUsers}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
