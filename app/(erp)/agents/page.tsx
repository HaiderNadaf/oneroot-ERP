"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useBranchOptions } from "@/components/BranchNotice";
import { ActionsTd, ActionsTh, Button, Card, DateInput, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, Pagination, RowAction, SearchInput, Select, Table, Td, Th, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Agent, Paged } from "@/lib/types";

export default function AgentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Sales totals cover this range; empty = all time
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  // Agent being edited; null = adding a new one
  const [editing, setEditing] = useState<Agent | null>(null);
  const openForm = (a: Agent | null) => {
    setEditing(a);
    setFormOpen(true);
  };
  const q = useDebounced(search);
  const canAdd = can("vendors.create");
  const canEdit = can("vendors.edit");
  const canDelete = can("vendors.delete");
  // The full list (branch, paging) needs vendors.view; billing staff read the plain agent options instead
  const full = can("vendors.view");
  const listed = useApi<Paged<Agent>>(full ? "/agents" : null, { search: q, from, to, page, pageSize: 25 });
  const options = useApi<Agent[]>(full ? null : "/agents/options");
  const { error, loading, reload } = full ? listed : options;
  const data: Paged<Agent> | null = full ? listed.data : options.data && filterOptions(options.data, q);
  const fullName = (a: Agent) => [a.firstName, a.lastName].filter(Boolean).join(" ");

  async function remove(a: Agent) {
    if (!(await confirm(`Delete agent ${fullName(a)} (${a.agentId})?`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/agents/${a.id}`);
      toast.success(`${a.agentId} deleted`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const cols = 4 + (full ? 4 : 0) + (canEdit || canDelete ? 1 : 0);
  const salesLink = (a: Agent) => `/agents/${a.id}${from || to ? `?${new URLSearchParams({ from, to })}` : ""}`;

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Agents who bring in vendors and customers"
        actions={
          canAdd && (
            <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
              New Agent
            </Button>
          )
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, mobile or agent ID…"
            className="w-full flex-1 sm:w-auto sm:min-w-60"
          />
          {full && (
            <div className="flex w-full items-center gap-1.5 sm:w-auto" title="Sales between these dates">
              <DateInput value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="Sales from date" />
              <span className="text-xs text-slate-400">to</span>
              <DateInput value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="Sales to date" />
            </div>
          )}
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Agent ID</Th>
                <Th>First Name</Th>
                <Th>Last Name</Th>
                <Th>Mobile</Th>
                {full && <Th>Branch</Th>}
                {full && <Th>Added On</Th>}
                {full && <Th right>Bills</Th>}
                {full && <Th right>Total Sales</Th>}
                {(canEdit || canDelete) && <ActionsTh />}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={cols} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={cols}>
                  {search ? "No agents match this search." : "No agents yet."}{" "}
                  {canAdd && !search && (
                    <button className="font-medium text-brand-700 underline" onClick={() => openForm(null)}>
                      Add Your First Agent
                    </button>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs font-medium text-slate-900">
                      {full ? (
                        <Link href={salesLink(a)} className="hover:text-brand-700 hover:underline">
                          {a.agentId}
                        </Link>
                      ) : (
                        a.agentId
                      )}
                    </Td>
                    <Td>{a.firstName}</Td>
                    <Td>{a.lastName || "—"}</Td>
                    <Td className="whitespace-nowrap">{a.mobile ? <a href={`tel:${a.mobile}`} className="hover:text-brand-700">{a.mobile}</a> : "—"}</Td>
                    {full && <Td>{a.branch ? `${a.branch.name} (${a.branch.code})` : "—"}</Td>}
                    {full && <Td className="text-slate-500">{date(a.createdAt)}</Td>}
                    {full && (
                      <Td right className="num text-slate-600">
                        {a.sales?.count ?? 0}
                      </Td>
                    )}
                    {full && (
                      <Td right className="whitespace-nowrap">
                        <Link href={salesLink(a)} className="num font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                          {inr(a.sales?.total ?? 0)}
                        </Link>
                      </Td>
                    )}
                    {(canEdit || canDelete) && (
                      <ActionsTd>
                        {canEdit && <RowAction kind="edit" title={`Edit ${a.agentId}`} onClick={() => openForm(a)} />}
                        {canDelete && <RowAction kind="delete" title={`Delete ${a.agentId}`} onClick={() => remove(a)} />}
                      </ActionsTd>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <AgentForm
        key={editing?.id ?? "new"}
        agent={editing}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

/** Search the plain agent options in the browser, shaped like one page of the full list */
function filterOptions(items: Agent[], q: string): Paged<Agent> {
  const s = q.trim().toLowerCase();
  const hits = s ? items.filter((a) => [a.agentId, a.firstName, a.lastName, a.mobile].some((v) => v?.toLowerCase().includes(s))) : items;
  return { items: hits, total: hits.length, page: 1, pageSize: hits.length, totalPages: 1 };
}

/** Add or edit an agent: only the first name is required; the ORAGENT code comes from the database and never changes */
function AgentForm({ agent, open, onClose, onSaved }: { agent: Agent | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { branches, loading: branchesLoading } = useBranchOptions();
  const [firstName, setFirstName] = useState(agent?.firstName ?? "");
  const [lastName, setLastName] = useState(agent?.lastName ?? "");
  const [mobile, setMobile] = useState(agent?.mobile ?? "");
  const [branchId, setBranchId] = useState(agent?.branchId ?? "");
  const [saving, setSaving] = useState(false);
  // Next free code, read from the database each time the form opens; the final one is given on save
  const nextCode = useApi<{ agentId: string }>(open && !agent ? "/agents/next-code" : null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return toast.error("Enter the first name");
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) return toast.error("Mobile must be 10 digits starting with 6, 7, 8 or 9");
    setSaving(true);
    try {
      const body = {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        mobile: mobile || undefined,
        branchId: branchId || undefined,
      };
      if (agent) {
        await api.patch<Agent>(`/agents/${agent.id}`, body);
        toast.success(`${agent.agentId} updated`);
        onSaved();
        return;
      }
      const saved = await api.post<Agent>("/agents", body);
      toast.success(`Agent ${saved.agentId} added`);
      setFirstName("");
      setLastName("");
      setMobile("");
      setBranchId("");
      void nextCode.reload();
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={agent ? `Edit Agent ${agent.agentId}` : "New Agent"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="agent-form" loading={saving}>
            {agent ? "Save" : "Add Agent"}
          </Button>
        </>
      }
    >
      <form id="agent-form" onSubmit={save} className="space-y-3">
        <Field label="Agent ID" hint={agent ? "Locked — an agent ID never changes" : "Next free code from the database, given when you save"}>
          <Input
            value={agent ? agent.agentId : (nextCode.data?.agentId ?? (nextCode.loading ? "Loading…" : ""))}
            readOnly
            tabIndex={-1}
            className="font-mono bg-slate-50"
          />
        </Field>
        <Field label="First Name" required>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </Field>
        <Field label="Last Name">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Mobile" hint="10 digits">
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
            placeholder="98765 43210"
          />
        </Field>
        <Field label="Branch">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branchesLoading && !branches.length}>
            <option value="">{branchesLoading && !branches.length ? "Loading Branches…" : "Choose Branch…"}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
