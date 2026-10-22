"use client";

import { RotateCcw } from "lucide-react";
import { Fragment } from "react";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_SECTIONS, hasPerm, normalizePermissions, type Permission, type PermissionAction } from "@/lib/permissions";
import { cx } from "./ui";

/**
 * Whether the signed-in person holds every one of these permissions. The API refuses to save a user or role
 * whose ticks go beyond the editor's own, so such users and roles are view-only for them.
 */
export function useCanGrantAll() {
  const { user: me } = useAuth();
  return (keys: readonly string[]) => normalizePermissions(keys).every((k) => hasPerm(me, k));
}

type Def = (typeof PERMISSIONS)[number];
type Crud = Exclude<PermissionAction, "other">;

const COLUMNS: { action: Crud; label: string }[] = [
  { action: "view", label: "View" },
  { action: "create", label: "Add" },
  { action: "edit", label: "Edit" },
  { action: "delete", label: "Delete" },
];

interface Row {
  section: string;
  module: string;
  cells: Partial<Record<Crud, Def>>;
  other: Def[];
}

/** One row per module (screen), in catalogue order */
const ROWS: Row[] = PERMISSIONS.reduce<Row[]>((rows, p) => {
  let row = rows.find((r) => r.module === p.module);
  if (!row) rows.push((row = { section: p.section, module: p.module, cells: {}, other: [] }));
  if (p.action === "other") row.other.push(p);
  else row.cells[p.action] = p;
  return rows;
}, []);

/** Ticked and saved like any other, but no screen checks it yet (e.g. editing an invoice): it applies once one does */
const isPlanned = (p: Def) => "planned" in p && p.planned === true;

const rowKeys = (r: Row) => [...COLUMNS.flatMap((c) => (r.cells[c.action] ? [r.cells[c.action]!.key] : [])), ...r.other.map((p) => p.key)];

/**
 * What a role may do, as a grid: one row per module with View / Add / Edit / Delete, plus that module's other
 * actions (approve, receive, transfer...). Every module has all four boxes; the ones no screen checks yet are dashed.
 * Ticking Add, Edit or Delete also ticks View; unticking View clears them.
 * `defaults` is what "reset" goes back to; ticks that differ from it are outlined.
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
  /** Outline role permissions that were unticked */
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
    // Add / Edit / Delete need the module's View; without View they go too
    for (const r of ROWS) {
      const view = r.cells.view?.key;
      if (!view) continue;
      const crud = (["create", "edit", "delete"] as const).map((a) => r.cells[a]?.key).filter((k): k is Permission => !!k);
      if (on && crud.some((k) => keys.includes(k) && next.has(k)) && grantable(view)) next.add(view);
      if (!on && keys.includes(view)) crud.forEach((k) => next.delete(k));
    }
    onChange(normalizePermissions([...next]));
  };

  const tick = (p: Def) => {
    const on = selected.has(p.key);
    const locked = disabled || !grantable(p.key);
    const changed = on ? !defaults.includes(p.key) : showRemoved && defaults.includes(p.key);
    const planned = isPlanned(p);
    return (
      <input
        type="checkbox"
        aria-label={p.label}
        title={!grantable(p.key) ? "You cannot grant what you do not have yourself" : planned ? `${p.module}: not in use yet — saved now, applies once this screen exists` : p.label}
        className={cx(
          "size-4 shrink-0 rounded border-slate-300 accent-brand-600 disabled:cursor-not-allowed",
          planned && !on && "opacity-60",
          planned && "outline-dashed outline-1 outline-offset-2 outline-slate-300",
          changed && !disabled && "outline outline-2 outline-offset-1",
          changed && !disabled && (on ? "outline-amber-400" : "outline-red-400"),
        )}
        checked={on}
        disabled={locked}
        onChange={(e) => set([p.key], e.target.checked)}
      />
    );
  };

  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          Access{" "}
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
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Module</th>
                {COLUMNS.map((c) => {
                  const keys = ROWS.flatMap((r) => (r.cells[c.action] ? [r.cells[c.action]!.key] : [])).filter(grantable);
                  const all = keys.length > 0 && keys.every((k) => selected.has(k));
                  return (
                    <th key={c.action} className="w-16 px-2 py-2 text-center font-semibold">
                      {disabled || !keys.length ? (
                        c.label
                      ) : (
                        <button type="button" onClick={() => set(keys, !all)} className="hover:text-brand-700 hover:underline" title={all ? `Clear ${c.label} everywhere` : `Tick ${c.label} everywhere`}>
                          {c.label}
                        </button>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left font-semibold">Other Actions</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_SECTIONS.map((section) => {
                const rows = ROWS.filter((r) => r.section === section);
                const keys = rows.flatMap(rowKeys).filter(grantable);
                const on = keys.filter((k) => selected.has(k)).length;
                return (
                  <Fragment key={section}>
                    <tr className="border-t border-slate-200 bg-slate-50/60">
                      <td colSpan={COLUMNS.length + 2} className="px-3 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section}</span>
                          {!disabled && keys.length > 0 && (
                            <button type="button" onClick={() => set(keys, on < keys.length)} className="text-[11px] font-medium text-brand-700 hover:underline">
                              {on < keys.length ? "Select All" : "Clear"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {rows.map((r) => {
                      const mine = rowKeys(r).filter(grantable);
                      const full = mine.length > 0 && mine.every((k) => selected.has(k));
                      return (
                        <tr key={r.module} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-3 py-2">
                            {disabled || !mine.length ? (
                              <span className="font-medium text-slate-800">{r.module}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => set(mine, !full)}
                                className="text-left font-medium text-slate-800 hover:text-brand-700"
                                title={full ? `Clear everything for ${r.module}` : `Allow everything for ${r.module}`}
                              >
                                {r.module}
                              </button>
                            )}
                          </td>
                          {COLUMNS.map((c) => (
                            <td key={c.action} className="px-2 py-2 text-center">
                              {r.cells[c.action] && <span className="inline-flex">{tick(r.cells[c.action]!)}</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {r.other.map((p) => (
                                <label key={p.key} className={cx("inline-flex items-center gap-1.5 text-xs", disabled || !grantable(p.key) ? "text-slate-400" : "cursor-pointer text-slate-700")}>
                                  {tick(p)}
                                  {p.label}
                                </label>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span className="inline-block size-3 rounded-sm outline-dashed outline-1 outline-offset-1 outline-slate-400" />
            Dashed boxes are not in use yet (no screen checks them, e.g. editing an invoice). Tick them now and they apply once it does.
          </p>
        </div>
      )}
    </div>
  );
}
