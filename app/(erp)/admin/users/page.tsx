"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode, useBranchOptions } from "@/components/BranchNotice";
import { DepartmentsPanel } from "@/components/DepartmentsPanel";
import { PermissionPicker } from "@/components/PermissionPicker";
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
import { ROLES, type Role, type RoleTemplate, type User } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Everything, always — including users, store settings and the audit log",
  MANAGER: "Starts with inventory, purchases, reports, approvals and cancellations",
  CASHIER: "Starts with billing, customers and receipts",
  ACCOUNTANT: "Starts with purchases, payments, expenses, accounts and reports",
};

const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();

/** Custom roles grouped under their department, in the order the server sent them */
function groupByDepartment(list: RoleTemplate[]): [string, RoleTemplate[]][] {
  const map = new Map<string, RoleTemplate[]>();
  for (const t of list) {
    const key = t.department?.name ?? "No department";
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return [...map.entries()];
}

export default function UsersPage() {
  return (
    <RequirePerm perms={["admin.users"]}>
      <Users />
    </RequirePerm>
  );
}

function Users() {
  const { user: me, can } = useAuth();
  const { data, error, loading, reload } = useApi<User[]>("/users");
  const templates = useApi<RoleTemplate[]>("/roles/custom");
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{ template: RoleTemplate | null; departmentId: string | null } | null>(null);

  const open = (u: User | null) => {
    setEditing(u);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff who can sign in, what each of them may do, and which branch they work in"
        actions={
          <>
            {can("admin.roles") && (
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setRoleForm({ template: null, departmentId: null })}>
                New role
              </Button>
            )}
            <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
              New user
            </Button>
          </>
        }
      />

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Access</Th>
                <Th>Branch</Th>
                <Th>Phone</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={8} />
              ) : !data?.length ? (
                <EmptyRow colSpan={8}>No users</EmptyRow>
              ) : (
                data.map((u) => (
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
                      {u.roleTemplate ? (
                        <>
                          <span className="text-sm font-medium text-slate-800">{u.roleTemplate.name}</span>
                          <p className="text-xs text-slate-500">
                            {u.roleTemplate.department?.name ?? "No department"}
                          </p>
                        </>
                      ) : (
                        <StatusBadge status={u.role} />
                      )}
                    </Td>
                    <Td>
                      <AccessSummary user={u} templates={templates.data ?? []} />
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
                    <Td>{u.phone || "—"}</Td>
                    <Td className="text-xs">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</Td>
                    <Td>{u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}</Td>
                    <ActionsTd>
                      <RowAction kind="edit" title={`Edit ${u.name}`} onClick={() => open(u)} />
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
        canManage={can("admin.roles")}
        onNewRole={(departmentId) => setRoleForm({ template: null, departmentId })}
        onEditRole={(t) => setRoleForm({ template: t, departmentId: t.departmentId ?? null })}
        onChanged={() => void templates.reload()}
      />

      <Card title="Roles & permissions" className="mt-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2">
              <StatusBadge status={r} />
              <dd className="text-sm text-slate-600">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Permissions:</b> a role only fills in the starting ticks. Tick or untick anything in the
          user form to give exactly the access you want — the sidebar, the pages and the API all follow the ticks. Put roles inside a
          department (Procurement, Sales, Warehouse...) so the right people find them; discount, refund and adjustment ceilings still come
          from the limits chosen for each role (Roles &amp; Limits).
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

/** What the user's ticks are compared against: their custom role, else the built-in role */
function baselineFor(user: { role: Role; roleTemplateId?: string | null }, templates: RoleTemplate[]): Permission[] {
  const t = user.roleTemplateId ? templates.find((x) => x.id === user.roleTemplateId) : null;
  return t ? normalizePermissions(t.permissions) : defaultsFor(user.role);
}

/** "Everything", "Manager defaults", "Store supervisor" or "Custom · 12 of 39" */
function AccessSummary({ user, templates }: { user: User; templates: RoleTemplate[] }) {
  if (user.role === "ADMIN") return <span className="text-xs text-slate-500">Everything</span>;
  const mine = normalizePermissions(user.permissions ?? []);
  const base = baselineFor(user, templates);
  const custom = mine.length !== base.length || mine.some((k) => !base.includes(k));
  return (
    <span className="text-xs text-slate-500">
      {custom ? <Badge tone="amber">Custom</Badge> : user.roleTemplate ? "As per role" : `${roleName(user.role)} defaults`}
      <span className="num ml-1.5">
        {mine.length} of {PERMISSIONS.length}
      </span>
    </span>
  );
}

/** Built-in roles plus the store's own roles, grouped by department; picking one fills in its ticks */
function RolePicker({
  role,
  templateId,
  templates,
  onPick,
  onNewRole,
  disabled,
}: {
  role: Role;
  templateId: string | null;
  templates: RoleTemplate[];
  onPick: (role: Role, template: RoleTemplate | null) => void;
  onNewRole?: () => void;
  disabled?: boolean;
}) {
  const { isAdmin } = useAuth();
  const card = (selected: boolean, off: boolean) =>
    cx(
      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
      selected ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-slate-200 hover:bg-slate-50",
      off && "opacity-60",
    );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => {
          // Only an administrator can make another administrator
          const off = disabled || (r === "ADMIN" && !isAdmin);
          return (
            <button key={r} type="button" disabled={off} onClick={() => onPick(r, null)} className={card(!templateId && role === r, false)}>
              <p className="text-sm font-medium text-slate-800">{roleName(r)}</p>
              <p className="text-xs text-slate-500">{ROLE_INFO[r]}</p>
            </button>
          );
        })}
      </div>
      {templates.length > 0 && (
        <div className="space-y-2">
          {groupByDepartment(templates).map(([dept, list]) => (
            <div key={dept}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{dept}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((t) => (
                  <button key={t.id} type="button" disabled={disabled} onClick={() => onPick(t.baseRole, t)} className={card(templateId === t.id, false)}>
                    <p className="text-sm font-medium text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      {t.description || `${t.permissions.length} permissions`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {onNewRole && !disabled && (
        <button
          type="button"
          onClick={onNewRole}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-1">
            <Plus className="size-4" /> New role…
          </span>
          <p className="text-xs font-normal text-slate-500">Make a role inside a department, e.g. Procurement → Category Head</p>
        </button>
      )}
    </div>
  );
}

function UserForm({
  user,
  isSelf,
  templates,
  onTemplatesChanged,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  templates: RoleTemplate[];
  onTemplatesChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { user: me, can } = useAuth();
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "CASHIER");
  const [templateId, setTemplateId] = useState<string | null>(user?.roleTemplateId ?? null);
  const [permissions, setPermissions] = useState<Permission[]>(() =>
    user ? normalizePermissions(user.permissions ?? []) : defaultsFor("CASHIER").filter((k) => hasPerm(me, k)),
  );
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [branchId, setBranchId] = useState(user?.branchId ?? user?.branch?.id ?? "");
  const { branches, loading: branchesLoading } = useBranchOptions();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState(false);
  const approver = hasPerm({ role, permissions }, "approvals.decide");
  const template = templateId ? (templates.find((t) => t.id === templateId) ?? null) : null;
  const baseline = template ? normalizePermissions(template.permissions) : defaultsFor(role);

  // Picking a role (built-in or your own) starts again from that role's ticks
  const pick = (r: Role, t: RoleTemplate | null) => {
    setRole(r);
    setTemplateId(t?.id ?? null);
    setPermissions(r === "ADMIN" ? [] : (t ? normalizePermissions(t.permissions) : defaultsFor(r)).filter((k) => hasPerm(me, k)));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 6) return toast.error("Password must be at least 6 characters");
    if (!editing && !password) return toast.error("Set a password for the new user");
    if (pin && !/^\d{4,6}$/.test(pin)) return toast.error("Approval PIN must be 4 to 6 digits");
    if (role !== "ADMIN" && !permissions.length) return toast.error("Tick at least one permission, or disable the account instead");
    setSaving(true);
    try {
      const access = { role, roleTemplateId: role === "ADMIN" ? null : templateId, permissions: role === "ADMIN" ? [] : permissions };
      if (editing) {
        const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), branchId };
        if (!isSelf) Object.assign(body, access, { isActive });
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
      title={editing ? `Edit ${user.name}` : "New user"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={saving}>
            {editing ? "Save changes" : "Create user"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email (used to sign in)" required={!editing} hint={editing ? "Email cannot be changed" : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!editing} disabled={editing} />
        </Field>
        <Field
          label={editing ? "Reset password" : "Password"}
          required={!editing}
          hint={editing ? "Leave blank to keep the current password" : "At least 6 characters"}
        >
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required={!editing} />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Role</span>
          <RolePicker role={role} templateId={templateId} templates={templates} onPick={pick} onNewRole={can("admin.roles") ? () => setNewRole(true) : undefined} disabled={isSelf} />
          {isSelf ? (
            <p className="mt-1 text-xs text-slate-400">You can&apos;t change your own role, permissions or disable your own account.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Picking a role fills in its usual ticks below; then give or take away whatever you like.</p>
          )}
        </div>
        <PermissionPicker
          value={permissions}
          onChange={setPermissions}
          defaults={baseline}
          resetLabel={`Reset to ${template ? template.name : `${roleName(role)} defaults`}`}
          disabled={isSelf}
          admin={role === "ADMIN"}
        />
        <Field
          label="Home branch"
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
            <option value="">All branches (owner / admin)</option>
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
            label={user?.hasPin ? "Change approval PIN" : "Approval PIN"}
            className="sm:col-span-2"
            hint="4–6 digits an approver types at the counter to approve a discount, refund or adjustment above a cashier's limit"
          >
            <div className="flex items-center gap-3">
              <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} disabled={clearPin} className="num w-40 tracking-[0.4em]" placeholder={user?.hasPin ? "••••" : ""} />
              {user?.hasPin && <Checkbox label="Remove PIN" checked={clearPin} onChange={setClearPin} />}
              {user?.hasPin && !clearPin && <Badge tone="green">PIN set</Badge>}
            </div>
          </Field>
        )}
        {editing && !isSelf && (
          <div className="sm:col-span-2">
            <Checkbox label="Active — can sign in" checked={isActive} onChange={setIsActive} />
          </div>
        )}
      </form>
      {newRole && (
        <RoleTemplateForm
          template={null}
          onClose={() => setNewRole(false)}
          onSaved={(t) => {
            setNewRole(false);
            onTemplatesChanged();
            pick(t.baseRole, t);
          }}
        />
      )}
    </Modal>
  );
}
