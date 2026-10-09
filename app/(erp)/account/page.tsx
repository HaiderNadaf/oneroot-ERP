"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { Button, Card, Field, Info, Input, PageHeader, StatusBadge, useToast } from "@/components/ui";
import { API_URL, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const ROLE_INFO: Record<Role, string> = {
  ADMIN: "Full access, including users, store settings and the audit log.",
  MANAGER: "Inventory, purchases, reports and cancellations.",
  CASHIER: "Billing, customers and receipts.",
  ACCOUNTANT: "Purchases, payments, expenses and reports.",
};

/**
 * The API answers a wrong current password with 401, which the shared client treats as an expired
 * session (and signs the user out). Call it directly so a typo only shows an error.
 */
async function changePassword(currentPassword: string, newPassword: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(msg || `Could not change password (${res.status})`);
  }
}

export default function AccountPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 6;
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) return setError("New password must be at least 6 characters");
    if (next !== confirm) return setError("New passwords don't match");
    if (next === current) return setError("New password must be different from the current one");
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="My account"
        actions={
          <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={logout}>
            Sign out
          </Button>
        }
      />
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-4">
            <Info label="Name">{user.name}</Info>
            <Info label="Email">{user.email}</Info>
            <Info label="Role">
              <StatusBadge status={user.role} />
              <span className="mt-1 block text-xs font-normal text-slate-500">{ROLE_INFO[user.role]}</span>
            </Info>
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">To change your name, phone or role, ask an administrator.</p>
        </Card>

        <Card title="Change password">
          <form onSubmit={submit} className="space-y-3">
            <Field label="Current password" required>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" required hint={tooShort ? undefined : "At least 6 characters"}>
              <Input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={tooShort ? "border-red-400" : undefined}
                required
              />
              {tooShort && <span className="mt-1 block text-xs text-red-600">At least 6 characters</span>}
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={mismatch ? "border-red-400" : undefined}
                required
              />
              {mismatch && <span className="mt-1 block text-xs text-red-600">Passwords don&apos;t match</span>}
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" loading={saving} icon={<KeyRound className="size-4" />} disabled={!current || !next || !confirm}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
