"use client";

import { ArrowLeftRight, Info as InfoIcon, Plus, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode } from "@/components/BranchNotice";
import { GstinField, StateSelect } from "@/components/GstinField";
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
  Table,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useBranch } from "@/lib/branch";
import { inr0 } from "@/lib/format";
import { parseGstin } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { Branch } from "@/lib/types";

export default function BranchesPage() {
  return (
    <RequirePerm perms={["admin.branches"]}>
      <Branches />
    </RequirePerm>
  );
}

function Branches() {
  const { data, error, loading, reload } = useApi<Branch[]>("/branches");
  const { currentId } = useBranch();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const open = (b: Branch | null) => {
    setEditing(b);
    setFormOpen(true);
  };

  const active = data?.filter((b) => b.isActive) ?? [];
  const totalValue = active.reduce((s, b) => s + (b.stockValue ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Store locations — each with its own stock, bills and staff"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
            New branch
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p>
            Each branch keeps its <b>own stock</b>: sales, purchases and goods inward take stock from or add it to the branch selected in
            the top bar. Products, prices, customers and vendors are shared by all branches.
          </p>
          <p>
            Staff assigned to a branch (under{" "}
            <Link href="/admin/users" className="font-medium underline-offset-2 hover:underline">
              Users
            </Link>
            ) only see that branch. To move stock between branches use{" "}
            <Link href="/inventory?tab=transfers" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
              Stock &amp; Batches → Transfers <ArrowLeftRight className="size-3.5" />
            </Link>
            .
          </p>
        </div>
      </div>

      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Branch</Th>
                <Th>Location</Th>
                <Th>Phone</Th>
                <Th right>Staff</Th>
                <Th right>Batches in stock</Th>
                <Th right>Stock value</Th>
                <Th>Status</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={8} />
              ) : !data?.length ? (
                <EmptyRow colSpan={8}>No branches yet</EmptyRow>
              ) : (
                data.map((b) => (
                  <tr key={b.id} className={cx("hover:bg-slate-50", !b.isActive && "text-slate-400")}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <BranchCode code={b.code} />
                        <span className={cx("font-medium", b.isActive ? "text-slate-900" : "text-slate-500")}>{b.name}</span>
                        {b.id === currentId && <Badge tone="blue">Selected</Badge>}
                      </div>
                      {b.gstin && <p className="mt-0.5 font-mono text-xs text-slate-500">GSTIN {b.gstin}</p>}
                    </Td>
                    <Td className="text-sm">
                      {[b.city, b.state].filter(Boolean).join(", ") || <span className="text-slate-400">—</span>}
                      {b.address && <p className="max-w-64 truncate text-xs text-slate-500">{b.address}</p>}
                    </Td>
                    <Td>{b.phone || <span className="text-slate-400">—</span>}</Td>
                    <Td right>{b.users ?? 0}</Td>
                    <Td right>{b.batches ?? 0}</Td>
                    <Td right className="font-medium text-slate-900">
                      {inr0(b.stockValue ?? 0)}
                    </Td>
                    <Td>{b.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                    <ActionsTd>
                      <RowAction kind="edit" title={`Edit ${b.name}`} onClick={() => open(b)} />
                    </ActionsTd>
                  </tr>
                ))
              )}
            </tbody>
            {active.length > 1 && (
              <tfoot>
                <tr>
                  <Td colSpan={5} className="border-b-0 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                    Stock value, all active branches
                  </Td>
                  <Td right className="border-b-0 font-semibold text-slate-900">
                    {inr0(totalValue)}
                  </Td>
                  <Td colSpan={2} className="border-b-0" />
                </tr>
              </tfoot>
            )}
          </Table>
        )}
      </Card>

      {formOpen && (
        <BranchForm
          branch={editing}
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

function BranchForm({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { refresh: refreshBranches } = useBranch();
  const editing = !!branch;
  const [code, setCode] = useState(branch?.code ?? "");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [city, setCity] = useState(branch?.city ?? "");
  const [state, setState] = useState(branch?.state ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [gstin, setGstin] = useState(branch?.gstin ?? "");
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeOk = /^[A-Z0-9]{2,8}$/.test(code);
  const gstinInfo = parseGstin(gstin);
  const deactivating = editing && branch.isActive && !isActive;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codeOk) return toast.error("Code must be 2–8 letters or digits, e.g. ERD");
    if (!name.trim()) return toast.error("Enter the branch name");
    if (!gstinInfo.empty && !gstinInfo.valid) return toast.error("Check the GSTIN — it isn't valid");
    if (phone.trim() && !/^[0-9+\-\s]{6,15}$/.test(phone.trim())) return toast.error("Enter a valid phone number");
    const body: Record<string, unknown> = {
      code,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state,
      phone: phone.trim(),
      gstin,
    };
    if (editing) body.isActive = isActive;
    setSaving(true);
    try {
      if (editing) {
        await api.patch<Branch>(`/branches/${branch.id}`, body);
        toast.success(`${name.trim()} updated`);
        refreshBranches();
      } else {
        const created = await api.post<Branch>("/branches", body);
        toast.success(`${created.name} (${created.code}) created — it's now in the top-bar branch picker`);
        refreshBranches();
      }
      onSaved();
    } catch (err) {
      // Shown in the form too: e.g. "This branch still has stock — transfer it to another branch first"
      setError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${branch.name}` : "New branch"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="branch-form" loading={saving} variant={deactivating ? "danger" : "primary"}>
            {editing ? (deactivating ? "Deactivate branch" : "Save changes") : "Create branch"}
          </Button>
        </>
      }
    >
      <form id="branch-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {error && (
          <div className="sm:col-span-3">
            <ErrorBox message={error} />
          </div>
        )}
        <Field label="Code" required hint="2–8 letters or digits, shown on documents">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="e.g. ERD"
            className={cx("font-mono tracking-wide", code && !codeOk && "border-red-400")}
            required
            autoFocus={!editing}
          />
        </Field>
        <Field label="Branch name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Erode Branch" required />
        </Field>
        <Field label="Address" className="sm:col-span-3">
          <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Door no., street, area" />
        </Field>
        <Field label="City / town">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <StateSelect value={state} onChange={setState} gstin={gstin} />
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <GstinField
          value={gstin}
          onChange={setGstin}
          onState={setState}
          showTaxType={false}
          label="GSTIN (if registered separately)"
          hint="Leave blank to bill under the store's GSTIN"
          className="sm:col-span-3"
        />
        {editing && (
          <div className="sm:col-span-3">
            <Checkbox label="Active — staff can pick and work in this branch" checked={isActive} onChange={setIsActive} />
            {deactivating && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                <Store className="mt-px size-3.5 shrink-0" />
                A branch can only be deactivated once its stock has been transferred out and its staff moved to another branch.
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
