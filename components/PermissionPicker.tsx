"use client";

import { RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_SECTIONS, hasPerm, normalizePermissions, type Permission } from "@/lib/permissions";
import { Badge, cx } from "./ui";

/**
 * Whether the signed-in person holds every one of these permissions. The API refuses to save a user or role
 * whose ticks go beyond the editor's own, so such users and roles are view-only for them.
 */
export function useCanGrantAll() {
  const { user: me } = useAuth();
  return (keys: readonly string[]) => normalizePermissions(keys).every((k) => hasPerm(me, k));
}

/**
 * Tick list of everything a user (or custom role) may do, grouped like the sidebar.
 * `defaults` is what "reset" goes back to and what counts as an "extra" tick.
 * The signed-in person can only hand out what they hold themselves.
 */
export function PermissionPicker({
  value,
  onChange,
  defaults,
  resetLabel,
  disabled,
  admin,
  showRemoved,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  defaults: Permission[];
  resetLabel?: string;
  disabled?: boolean;
  /** The target is an administrator: everything, nothing to tick */
  admin?: boolean;
  /** Mark role permissions that were unticked (user form: they are taken away from this one user) */
  showRemoved?: boolean;
}) {
  const { user: me } = useAuth();
  const selected = new Set(value);
  const grantable = (k: Permission) => hasPerm(me, k);
  const isDefault = value.length === defaults.length && defaults.every((k) => selected.has(k));

  const set = (keys: Permission[], on: boolean) => {
    const next = new Set(value);
    for (const k of keys) {
      if (!grantable(k)) continue;
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(normalizePermissions([...next]));
  };

  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          Permissions{" "}
          {!admin && (
            <span className="num font-normal text-slate-400">
              · {value.length} of {PERMISSIONS.length}
            </span>
          )}
        </span>
        {!admin && !disabled && resetLabel && (
          <button
            type="button"
            onClick={() => onChange(defaults.filter(grantable))}
            disabled={isDefault}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
          >
            <RotateCcw className="size-3" /> {resetLabel}
          </button>
        )}
      </div>
      {admin ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Administrators can do everything, including things that cannot be ticked for anyone else (rebuilding the ledger, resolving
          deposit differences).
        </p>
      ) : (
        <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          {PERMISSION_SECTIONS.map((section) => {
            const items = PERMISSIONS.filter((p) => p.section === section);
            const keys = items.map((p) => p.key);
            const allowed = keys.filter(grantable);
            const on = allowed.filter((k) => selected.has(k)).length;
            return (
              <fieldset key={section} className="min-w-0">
                <legend className="mb-1.5 flex w-full items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section}</span>
                  {!disabled && allowed.length > 0 && (
                    <button type="button" onClick={() => set(keys, on < allowed.length)} className="text-[11px] font-medium text-brand-700 hover:underline">
                      {on < allowed.length ? "Select All" : "Clear"}
                    </button>
                  )}
                </legend>
                <div className="space-y-1">
                  {items.map((p) => {
                    const locked = disabled || !grantable(p.key);
                    return (
                      <label
                        key={p.key}
                        className={cx(
                          "flex items-start gap-2 rounded-md px-1.5 py-1 text-sm",
                          locked ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700 hover:bg-slate-50",
                        )}
                        title={!grantable(p.key) ? "You cannot grant what you do not have yourself" : undefined}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-brand-600"
                          checked={selected.has(p.key)}
                          disabled={locked}
                          onChange={(e) => set([p.key], e.target.checked)}
                        />
                        <span className="leading-snug">
                          {p.label}
                          {!defaults.includes(p.key) && selected.has(p.key) && (
                            <span className="ml-1 align-middle">
                              <Badge tone="amber">extra</Badge>
                            </span>
                          )}
                          {showRemoved && defaults.includes(p.key) && !selected.has(p.key) && (
                            <span className="ml-1 align-middle">
                              <Badge tone="red">removed</Badge>
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
