"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { RequireRole } from "@/components/AppShell";
import { BranchCode, useBranchOptions } from "@/components/BranchNotice";
import {
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
import { ROLES, type Role, type User } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Everything, including users, store settings and the audit log",
  MANAGER: "Inventory, purchases, reports and cancellations",
  CASHIER: "Billing, customers and receipts",
  ACCOUNTANT: "Purchases, payments, expenses and reports",
};

export default function UsersPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <Users />
    </RequireRole>
  );
}

function Users() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi<User[]>("/users");
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const open = (u: User | null) => {
    setEditing(u);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff who can sign in, what each of them can do, and which branch they work in"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
            New user
          </Button>
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
                <Th>Branch</Th>
                <Th>Phone</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !data?.length ? (
                <EmptyRow colSpan={7}>No users</EmptyRow>
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
                      <StatusBadge status={u.role} />
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
                    <Td right>
                      <Button variant="ghost" size="sm" onClick={() => open(u)}>
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Roles" className="mt-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2">
              <StatusBadge status={r} />
              <dd className="text-sm text-slate-600">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
          <b className="font-medium text-slate-800">Home branch:</b> staff with a home branch are locked to it — they only see and
          record that branch&apos;s stock, sales and purchases. Leave it as &ldquo;All branches&rdquo; for owners and administrators who
          switch between branches from the top bar (an administrator&apos;s home branch is just the one selected when they sign in).
        </p>
      </Card>

      {formOpen && (
        <UserForm
          user={editing}
          isSelf={!!editing && editing.id === me?.id}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r)}
          className={cx(
            "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === r ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-slate-200 hover:bg-slate-50",
          )}
        >
          <p className="text-sm font-medium text-slate-800">{r.charAt(0) + r.slice(1).toLowerCase()}</p>
          <p className="text-xs text-slate-500">{ROLE_INFO[r]}</p>
        </button>
      ))}
    </div>
  );
}

function UserForm({ user, isSelf, onClose, onSaved }: { user: User | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "CASHIER");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [branchId, setBranchId] = useState(user?.branchId ?? user?.branch?.id ?? "");
  const { branches, loading: branchesLoading } = useBranchOptions();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const approver = role === "ADMIN" || role === "MANAGER";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 6) return toast.error("Password must be at least 6 characters");
    if (!editing && !password) return toast.error("Set a password for the new user");
    if (pin && !/^\d{4,6}$/.test(pin)) return toast.error("Approval PIN must be 4 to 6 digits");
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), branchId };
        if (!isSelf) {
          body.role = role;
          body.isActive = isActive;
        }
        if (password) body.password = password;
        if (clearPin) body.pin = "";
        else if (pin) body.pin = pin;
        await api.patch(`/users/${user.id}`, body);
        toast.success(password ? "User updated and password reset" : "User updated");
      } else {
        const created = await api.post<User>("/users", { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password, role, branchId });
        if (pin) await api.patch(`/users/${created.id}`, { pin });
        toast.success(`${name.trim()} can now sign in as ${role.toLowerCase()}`);
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
          <RolePicker value={role} onChange={setRole} disabled={isSelf} />
          {isSelf && <p className="mt-1 text-xs text-slate-400">You can&apos;t change your own role or disable your own account.</p>}
        </div>
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
            hint="4–6 digits a manager types at the counter to approve a discount, refund or adjustment above a cashier's limit"
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
    </Modal>
  );
}
