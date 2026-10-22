"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode, useBranchOptions } from "@/components/BranchNotice";
import { DepartmentsPanel } from "@/components/DepartmentsPanel";
import { PermissionPicker, useCanGrantAll } from "@/components/PermissionPicker";
import { RoleTemplateForm } from "@/components/RoleTemplateForm";
import {
  ActionsTd,
  ActionsTh,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  RowAction,
  Select,
  StatusBadge,
  Table,
  Td,
  Th,
  cx,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PERMISSIONS, defaultsFor, hasPerm, normalizePermissions, type Permission } from "@/lib/permissions";
import { ROLES, type BuiltInRole, type Department, type Role, type RoleTemplate, type User } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Everything, always — including users, store settings and the audit log",
  MANAGER: "Inventory, Purchases, Reports, Approvals and Cancellations",
  CASHIER: "Billing, Customers and Receipts",
  ACCOUNTANT: "Purchases, Payments, Expenses, Accounts and Reports",
};

/** A built-in role's permissions as set in Roles & Limits (the shipped defaults until they load) */
function rolePerms(role: Role, builtIns: BuiltInRole[]): Permission[] {
  const r = builtIns.find((b) => b.role === role);
  return r ? normalizePermissions(r.permissions) : defaultsFor(role);
}

const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

export default function UsersPage() {
  return (
    <RequirePerm perms={["admin.users"]}>
      <Users />
    </RequirePerm>
  );
}

function Users() {
  const { user: me, can, isAdmin } = useAuth();
  const { data, error, loading, reload } = useApi<User[]>("/users");
  const templates = useApi<RoleTemplate[]>("/roles/custom");
  const builtIns = useApi<BuiltInRole[]>("/roles/built-in");
  const departments = useApi<Department[]>("/departments");
  // "" = everyone, "none" = users on a built-in role, otherwise a department id
  const [deptFilter, setDeptFilter] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{ template: RoleTemplate | null; departmentId: string | null } | null>(null);

  const open = (u: User | null) => {
    setEditing(u);
    setFormOpen(true);
  };

  const rows = (data ?? []).filter((u) => {
    const dept = u.roleTemplate?.department?.id;
    return !deptFilter || (deptFilter === "none" ? !dept : dept === deptFilter);
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff who can sign in, what each of them may do, and which branch they work in"
        actions={
          <>
            {can("roles.create") && (
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRoleForm({ template: null, departmentId: null })}>
                New Role
              </Button>
            )}
            {can("users.create") && (
              <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
                New User
              </Button>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 p-3">
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full sm:w-64" aria-label="Department">
            <option value="">All Departments</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
            <option value="none">No Department</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>Branch</Th>
                <Th className="hidden md:table-cell">Phone</Th>
                <Th className="hidden md:table-cell">Last Sign-In</Th>
                <Th>Status</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={9} />
              ) : !rows.length ? (
                <EmptyRow colSpan={9}>{deptFilter ? "No users in this department" : "No users"}</EmptyRow>
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className={cx("hover:bg-slate-50", !u.isActive && "text-slate-400")}>
                    <Td>
                      <span className={cx("font-medium", u.isActive ? "text-slate-900" : "text-slate-500")}>{u.name}</span>
                      {u.id === me?.id && (
                        <span className="ml-1.5">
                          <Badge tone="blue">You</Badge>
                        </span>
                      )}
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </Td>
                    <Td>
                      {u.roleTemplate?.department ? (
                        <>
                          <span className="text-sm font-medium text-slate-800">{u.roleTemplate.department.name}</span>
                          {u.roleTemplate.department.code && <p className="font-mono text-xs text-slate-500">{u.roleTemplate.department.code}</p>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>
                      {u.roleTemplate ? (
                        <>
                          <span className="text-sm font-medium text-slate-800">{u.roleTemplate.name}</span>
                          <p className="text-xs text-slate-500">Limits of {roleName(u.roleTemplate.baseRole ?? u.role)}</p>
                        </>
                      ) : (
                        <StatusBadge status={u.role} />
                      )}
                    </Td>
                    <Td>
                      <AccessSummary user={u} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {u.branch ? (
                        <span className="inline-flex items-center gap-1.5">
                          <BranchCode code={u.branch.code} />
                          <span className="text-sm">{u.branch.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">All branches</span>
                      )}
                    </Td>
                    <Td className="hidden md:table-cell">{u.phone || "—"}</Td>
                    <Td className="hidden text-xs md:table-cell">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</Td>
                    <Td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}</Td>
                    <ActionsTd>
                      {/* Only an administrator can edit an administrator */}
                      {can("users.edit") && (isAdmin || u.role !== "ADMIN") && <RowAction kind="edit" title={`Edit ${u.name}`} onClick={() => open(u)} />}
                    </ActionsTd>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      <DepartmentsPanel
        templates={templates.data ?? []}
        canCreate={can("roles.create")}
        canEdit={can("roles.edit")}
        canDelete={can("roles.delete")}
        onNewRole={(departmentId) => setRoleForm({ template: null, departmentId })}
        onEditRole={(t) => setRoleForm({ template: t, departmentId: t.departmentId ?? null })}
        onChanged={() => void templates.reload()}
      />

      <Card title="Roles & Permissions" className="mt-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2">
              <StatusBadge status={r} />
              <dd className="text-sm text-slate-600">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Permissions:</b> every user gets a department and a role inside it, and that role alone
          decides what they can open — the sidebar, the pages and the API all follow it. Edit a role and everyone on it follows; there are
          no per-person extras. Administrators are the only users outside a department. Discount, refund and adjustment ceilings come from
          the limits of the built-in role each role is based on (Roles &amp; Limits).
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Home branch:</b> staff with a home branch are locked to it — they only see and
          record that branch&apos;s stock, sales and purchases. Leave it as &ldquo;All branches&rdquo; for owners and administrators who
          switch between branches from the top bar (an administrator&apos;s home branch is just the one selected when they sign in).
        </p>
      </Card>

      {formOpen && (
        <UserForm
          user={editing}
          isSelf={!!editing && editing.id === me?.id}
          templates={templates.data ?? []}
          builtIns={builtIns.data ?? []}
          onTemplatesChanged={() => void templates.reload()}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void reload();
            void templates.reload();
          }}
        />
      )}
      {roleForm && (
        <RoleTemplateForm
          template={roleForm.template}
          initialDepartmentId={roleForm.departmentId}
          onClose={() => setRoleForm(null)}
          onSaved={() => {
            setRoleForm(null);
            void templates.reload();
          }}
        />
      )}
    </>
  );
}

/** Access comes only from the user's department role: "Everything" for administrators, else how many permissions it gives */
function AccessSummary({ user }: { user: User }) {
  if (user.role === "ADMIN") return <span className="text-xs text-slate-500">Everything</span>;
  if (!user.roleTemplate) return <Badge tone="amber">Needs a Department Role</Badge>;
  return (
    <span className="num text-xs text-slate-500">
      {normalizePermissions(user.permissions ?? []).length} of {PERMISSIONS.length} from role
    </span>
  );
}

/**
 * Department first, then one of the roles inside it: that role alone decides what the user may do.
 * Administrator is the only access outside a department (only an administrator can give it).
 */
function DepartmentRolePicker({
  role,
  templateId,
  departmentId,
  templates,
  onDepartment,
  onPick,
  onNewRole,
  disabled,
}: {
  role: Role;
  templateId: string | null;
  /** "" = not chosen yet, "admin" = Administrator, otherwise a department id */
  departmentId: string;
  templates: RoleTemplate[];
  onDepartment: (departmentId: string) => void;
  onPick: (role: Role, template: RoleTemplate | null) => void;
  onNewRole?: () => void;
  disabled?: boolean;
}) {
  const { isAdmin } = useAuth();
  const departments = useApi<Department[]>("/departments");
  const inDepartment = templates.filter((t) => (t.departmentId ?? "") === departmentId);
  const department = departments.data?.find((d) => d.id === departmentId);
  const template = inDepartment.find((t) => t.id === templateId);
  const inDept = !!departmentId && departmentId !== "admin";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Department" required>
        <Select value={departmentId} onChange={(e) => onDepartment(e.target.value)} disabled={disabled}>
          <option value="">{departments.loading ? "Loading Departments…" : "Choose a Department"}</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.code})
            </option>
          ))}
          {/* Only an administrator can make another administrator */}
          {(isAdmin || role === "ADMIN") && <option value="admin">None — Administrator (Full Access)</option>}
        </Select>
      </Field>
      {inDept ? (
        <Field label="Role" required hint={template?.description || (template ? `${template.permissions.length} permissions` : undefined)}>
          <Select
            value={templateId ?? ""}
            onChange={(e) => {
              const t = inDepartment.find((x) => x.id === e.target.value);
              if (t) onPick(t.baseRole, t);
            }}
            disabled={disabled || !inDepartment.length}
          >
            <option value="">{inDepartment.length ? "Choose a Role" : "No Roles in This Department Yet"}</option>
            {inDepartment.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : departmentId === "admin" ? (
        <p className="self-end pb-2 text-xs text-slate-500">{ROLE_INFO.ADMIN}</p>
      ) : (
        <div className="hidden sm:block" />
      )}
      {onNewRole && !disabled && inDept && (
        <button
          type="button"
          onClick={onNewRole}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-slate-50 sm:col-span-2"
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="size-4" /> New Role in {department?.name ?? "This Department"}…
          </span>
          <p className="text-xs font-normal text-slate-500">e.g. Procurement → Category Head</p>
        </button>
      )}
    </div>
  );
}

function UserForm({
  user,
  isSelf,
  templates,
  builtIns,
  onTemplatesChanged,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  templates: RoleTemplate[];
  builtIns: BuiltInRole[];
  onTemplatesChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "CASHIER");
  const [templateId, setTemplateId] = useState<string | null>(user?.roleTemplateId ?? null);
  const [departmentId, setDepartmentId] = useState(user?.role === "ADMIN" ? "admin" : (user?.roleTemplate?.department?.id ?? ""));
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [branchId, setBranchId] = useState(user?.branchId ?? user?.branch?.id ?? "");
  const { branches, loading: branchesLoading } = useBranchOptions();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState(false);

  // Someone holding permissions you don't have keeps their role and ticks; only an administrator can change those
  const canGrantAll = useCanGrantAll();
  const outranks = !!user && !canGrantAll(user.permissions ?? []);
  const accessLocked = isSelf || outranks;
  const template = templateId ? (templates.find((t) => t.id === templateId) ?? null) : null;
  // Exactly the role's permissions — nothing is ticked per person
  const permissions: Permission[] =
    role === "ADMIN" ? [] : template ? normalizePermissions(template.permissions) : user && !departmentId ? rolePerms(role, builtIns) : [];
  const approver = hasPerm({ role, permissions }, "approvals.decide");

  const pick = (r: Role, t: RoleTemplate | null) => {
    setRole(r);
    setTemplateId(t?.id ?? null);
  };

  // Another department: its role must be chosen again (picked straight away when it has only one)
  const changeDepartment = (id: string) => {
    setDepartmentId(id);
    const inDepartment = templates.filter((t) => t.departmentId === id);
    if (id === "admin") pick("ADMIN", null);
    else if (inDepartment.length === 1) pick(inDepartment[0].baseRole, inDepartment[0]);
    else setTemplateId(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 6) return toast.error("Password must be at least 6 characters");
    if (!editing && !password) return toast.error("Set a password for the new user");
    if (pin && !/^\d{4,6}$/.test(pin)) return toast.error("Approval PIN must be 4 to 6 digits");
    if (!departmentId) return toast.error("Choose the user's department");
    if (departmentId !== "admin" && !templateId) return toast.error("Choose the user's role in the department");
    setSaving(true);
    try {
      const access = { role, roleTemplateId: role === "ADMIN" ? null : templateId };
      if (editing) {
        const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), branchId };
        if (!isSelf) Object.assign(body, outranks ? {} : access, { isActive });
        if (password) body.password = password;
        if (clearPin) body.pin = "";
        else if (pin) body.pin = pin;
        await api.patch(`/users/${user.id}`, body);
        toast.success(password ? "User updated and password reset" : "User updated");
      } else {
        const created = await api.post<User>("/users", { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password, branchId, ...access });
        if (pin) await api.patch(`/users/${created.id}`, { pin });
        toast.success(`${name.trim()} can now sign in as ${template?.name ?? role.toLowerCase()}`);
      }
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
      title={editing ? `Edit ${user.name}` : "New User"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {editing ? "Save Changes" : "Create User"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email (Used to Sign In)" required={!editing} hint={editing ? "Email cannot be changed" : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!editing} disabled={editing} />
        </Field>
        <Field
          label={editing ? "Reset Password" : "Password"}
          required={!editing}
          hint={editing ? "Leave blank to keep the current password" : "At least 6 characters"}
        >
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required={!editing} />
        </Field>
        <div className="sm:col-span-2">
          <DepartmentRolePicker
            role={role}
            templateId={templateId}
            departmentId={departmentId}
            templates={templates}
            onDepartment={changeDepartment}
            onPick={pick}
            onNewRole={can("roles.create") ? () => setNewRole(true) : undefined}
            disabled={accessLocked}
          />
          {isSelf ? (
            <p className="mt-1 text-xs text-slate-400">You can&apos;t change your own role, permissions or disable your own account.</p>
          ) : outranks ? (
            <p className="mt-1 text-xs text-slate-400">This person has permissions you don&apos;t hold, so only an administrator can change their role.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              The department role alone decides what this person may do. To change their access, edit the role or give them another one.
            </p>
          )}
        </div>
        {(role === "ADMIN" || template) && (
          <PermissionPicker value={permissions} onChange={() => {}} defaults={permissions} disabled admin={role === "ADMIN"} />
        )}
        <Field
          label="Home Branch"
          className="sm:col-span-2"
          hint={
            branchId
              ? role === "ADMIN"
                ? "Administrators can still switch branches; this is just where they start"
                : "Locked to this branch — they only see and work in it"
              : "Can switch between all branches from the top bar"
          }
        >
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All Branches (Owner / Admin)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
            {branchId && !branches.some((b) => b.id === branchId) && (
              <option value={branchId}>
                {user?.branch ? `${user.branch.name} (${user.branch.code})${branchesLoading ? "" : " — inactive"}` : branchId}
              </option>
            )}
          </Select>
        </Field>
        {approver && (
          <Field
            label={user?.hasPin ? "Change Approval PIN" : "Approval PIN"}
            className="sm:col-span-2"
            hint="4–6 digits an approver types at the counter to approve a discount, refund or adjustment above a cashier's limit"
          >
            <div className="flex items-center gap-3">
              <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} disabled={clearPin} className="num w-40 tracking-[0.4em]" placeholder={user?.hasPin ? "••••" : ""} />
              {user?.hasPin && <Checkbox label="Remove PIN" checked={clearPin} onChange={setClearPin} />}
              {user?.hasPin && !clearPin && <Badge tone="green">PIN Set</Badge>}
            </div>
          </Field>
        )}
        {editing && !isSelf && (
          <div className="sm:col-span-2">
            <Checkbox label="Active — Can Sign In" checked={isActive} onChange={setIsActive} />
          </div>
        )}
      </form>
      {newRole && (
        <RoleTemplateForm
          template={null}
          initialDepartmentId={departmentId || null}
          onClose={() => setNewRole(false)}
          onSaved={(t) => {
            setNewRole(false);
            onTemplatesChanged();
            setDepartmentId(t.departmentId ?? "");
            pick(t.baseRole, t);
          }}
        />
      )}
    </Modal>
  );
}
