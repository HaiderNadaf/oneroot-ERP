"use client";

import { useState } from "react";
import { DepartmentForm } from "@/components/DepartmentsPanel";
import {
  ActionsTd,
  ActionsTh,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  RowAction,
  SearchInput,
  Table,
  Td,
  Th,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { clearApiCache, useApi } from "@/lib/hooks";
import type { Department } from "@/lib/types";

/** Users page → Department tab: functions of the business (Procurement, Sales, Warehouse...) that custom roles sit inside */
/** `adding`: the page's New Department button was pressed; `onAddDone` closes that form */
export function DepartmentsTab({ adding = false, onAddDone }: { adding?: boolean; onAddDone?: () => void }) {
  const { data, error, loading, reload } = useApi<Department[]>("/departments");
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = can("roles.edit");
  const canDelete = can("roles.delete");
  const canManage = canEdit || canDelete;
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ department: Department | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    clearApiCache("/departments");
    void reload();
  };

  async function remove(d: Department) {
    if (!(await confirm(`Delete the department "${d.name}" (${d.code})?`, { confirmLabel: "Delete", danger: true }))) return;
    setBusy(d.id);
    try {
      await api.del(`/departments/${d.id}`);
      toast.success(`"${d.name}" deleted`);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const q = search.trim().toLowerCase();
  const rows = (data ?? []).filter((d) => !q || [d.code, d.name, d.description ?? ""].some((v) => v.toLowerCase().includes(q)));

  return (
    <>
      <p className="mb-3 text-sm text-slate-500">Functions of the business (Procurement, Sales, Warehouse...) that custom roles sit inside</p>

      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by ID, name or description…" className="max-w-sm" />
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Department ID</Th>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th right>Roles</Th>
                <Th>Created</Th>
                {canManage && <ActionsTh />}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={canManage ? 6 : 5} />
              ) : !rows.length ? (
                <EmptyRow colSpan={canManage ? 6 : 5}>{q ? "No departments match your search" : "No departments yet"}</EmptyRow>
              ) : (
                rows.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-sm">{d.code}</Td>
                    <Td className="font-medium text-slate-900">{d.name}</Td>
                    <Td className="text-sm">{d.description || <span className="text-slate-400">—</span>}</Td>
                    <Td right>{d.roleCount}</Td>
                    <Td className="text-sm">{date(d.createdAt)}</Td>
                    {canManage && (
                      <ActionsTd>
                        {canEdit && <RowAction kind="edit" title={`Edit ${d.name}`} onClick={() => setForm({ department: d })} />}
                        {canDelete && <RowAction
                          kind="delete"
                          title={d.roleCount > 0 ? "Move or delete its roles first" : `Delete ${d.name}`}
                          disabled={d.roleCount > 0 || busy === d.id}
                          loading={busy === d.id}
                          onClick={() => remove(d)}
                        />}
                      </ActionsTd>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      {(form || adding) && (
        <DepartmentForm
          department={form?.department ?? null}
          onClose={() => {
            setForm(null);
            onAddDone?.();
          }}
          onSaved={() => {
            setForm(null);
            onAddDone?.();
            refresh();
          }}
        />
      )}
    </>
  );
}
