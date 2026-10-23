"use client";

import { Plus, Store } from "lucide-react";
import Link from "next/link";
import { Fragment, useState, type FormEvent } from "react";
import { GstinField, StateSelect } from "@/components/GstinField";
import { VendorPicker } from "@/components/pickers";
import { ActionsTd, ActionsTh, Badge, Button, Card, Checkbox, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, Pagination, RowAction, SearchInput, Select, Table, Td, Th, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged, Vendor, VendorBranch } from "@/lib/types";

/** "Shop 7, APMC Yard, Chamarajanagar, Karnataka 571313" */
export const branchAddress = (b: Pick<VendorBranch, "address" | "city" | "state" | "pincode">) =>
  [b.address, b.city, [b.state, b.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** "Bengaluru Depot (BLR)" */
export const branchLabel = (b: Pick<VendorBranch, "name" | "code">) => (b.code ? `${b.name} (${b.code})` : b.name);

/**
 * Vendor branches as a table: every vendor's (the Vendor Branches page) or one vendor's (the vendor page).
 * Add, edit and remove need the vendor edit / delete rights.
 */
export function VendorBranchList({ vendor }: { vendor?: Pick<Vendor, "id" | "name"> }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<VendorBranch | "new" | null>(null);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<Paged<VendorBranch>>("/vendor-branches", { vendorId: vendor?.id, search: q, status, page, pageSize: 50 });
  const canAdd = can("vendors.create") || can("vendors.edit");
  const canEdit = can("vendors.edit");
  const canDelete = can("vendors.delete") || can("vendors.edit");
  const cols = 6 + (canEdit || canDelete ? 1 : 0);
  // Depot page: the depots grouped under their vendor (the list comes sorted by vendor)
  const groups: { vendor: VendorBranch["vendor"]; rows: VendorBranch[] }[] = [];
  for (const b of data?.items ?? []) {
    const g = groups[groups.length - 1];
    if (g && g.vendor?.id === b.vendor?.id) g.rows.push(b);
    else groups.push({ vendor: b.vendor, rows: [b] });
  }

  async function remove(b: VendorBranch) {
    if (!(await confirm(`Remove branch ${b.name}? If a PO already uses it, it is made inactive instead.`, { danger: true, confirmLabel: "Remove" }))) return;
    try {
      const r = await api.del<{ deleted: boolean }>(`/vendor-branches/${b.id}`);
      toast.success(r.deleted ? `${b.name} removed` : `${b.name} made inactive (used on POs)`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <Card
      bodyClassName="p-0"
      title={
        vendor ? (
          <span className="inline-flex items-center gap-1.5">
            <Store className="size-4 text-slate-400" /> Depots{data ? ` (${data.total})` : ""}
          </span>
        ) : undefined
      }
      actions={
        vendor &&
        canAdd && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Add Depot
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={vendor ? "Search depot, city, GSTIN…" : "Search vendor, depot, city, GSTIN…"}
          className="w-full flex-1 sm:w-auto sm:min-w-60"
        />
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-full sm:w-40" aria-label="Status">
          <option value="">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </Select>
        {!vendor && canAdd && (
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New Depot
          </Button>
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
              <Th>{vendor ? "Depot" : "Vendor / Depot"}</Th>
              <Th>Address</Th>
              <Th>GSTIN</Th>
              <Th>Contact</Th>
              <Th right>POs</Th>
              <Th>Status</Th>
              {(canEdit || canDelete) && <ActionsTh />}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={cols} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={cols}>
                {search || status ? "No depots match." : vendor ? `No depots yet — add the depots / branches you buy from ${vendor.name}.` : "No depots yet — add them on the vendor form or with New Depot."}
              </EmptyRow>
            ) : (
              groups.map((g) => (
                <Fragment key={g.vendor?.id ?? g.rows[0].id}>
                  {!vendor && (
                    <tr className="bg-slate-50">
                      <td colSpan={cols} className="px-3 py-2">
                        {g.vendor && can("vendors.view") ? (
                          <Link href={`/vendors/${g.vendor.id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                            {g.vendor.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-900">{g.vendor?.name}</span>
                        )}
                        <span className="ml-2 text-xs text-slate-500">
                          {g.vendor?.code && <span className="font-mono">{g.vendor.code} · </span>}
                          {g.rows.length} depot{g.rows.length === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((b, j) => (
                <tr key={b.id} className={cx("align-top hover:bg-slate-50", !b.isActive && "opacity-60")}>
                  <Td className={cx("font-medium text-slate-900", !vendor && "pl-8")}>
                    {branchLabel(b)}
                    {/* The vendor's first depot is its primary one */}
                    {page === 1 && j === 0 && !search && !status && (
                      <span className="ml-1.5 align-middle">
                        <Badge tone="green">Primary</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-xs text-xs text-slate-600">{branchAddress(b) || "—"}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{b.gstin || "—"}</Td>
                  <Td className="text-xs text-slate-600">
                    {b.contactPerson && <p className="font-medium text-slate-800">{b.contactPerson}</p>}
                    {[b.phone, b.email].filter(Boolean).join(" · ") || (!b.contactPerson && "—")}
                  </Td>
                  <Td right className="num">
                    {b._count?.purchaseOrders ?? 0}
                  </Td>
                  <Td>{b.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  {(canEdit || canDelete) && (
                    <ActionsTd>
                      {canEdit && <RowAction kind="edit" title={`Edit ${b.name}`} onClick={() => setEditing(b)} />}
                      {canDelete && <RowAction kind="delete" title={`Remove ${b.name}`} onClick={() => void remove(b)} />}
                    </ActionsTd>
                  )}
                </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      {editing && (
        <VendorBranchForm
          branch={editing === "new" ? null : editing}
          vendor={vendor}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Card>
  );
}

/** Add or edit a vendor branch; on the vendor's page the vendor is fixed, elsewhere it is picked */
export function VendorBranchForm({
  branch,
  vendor: fixedVendor,
  onClose,
  onSaved,
}: {
  branch: VendorBranch | null;
  vendor?: Pick<Vendor, "id" | "name">;
  onClose: () => void;
  onSaved: (b: VendorBranch) => void;
}) {
  const toast = useToast();
  const [vendor, setVendor] = useState<Pick<Vendor, "id" | "name"> | null>(fixedVendor ?? branch?.vendor ?? null);
  const [f, setF] = useState({
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    contactPerson: branch?.contactPerson ?? "",
    phone: branch?.phone ?? "",
    email: branch?.email ?? "",
    gstin: branch?.gstin ?? "",
    address: branch?.address ?? "",
    city: branch?.city ?? "",
    state: branch?.state ?? "",
    pincode: branch?.pincode ?? "",
  });
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!vendor) return toast.error("Choose the vendor");
    if (!f.name.trim()) return toast.error("Enter the depot name");
    if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) return toast.error("Phone must be 10 digits starting with 6, 7, 8 or 9");
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) return toast.error("Pincode must be 6 digits");
    setSaving(true);
    try {
      const body = { ...f, isActive, ...(branch ? {} : { vendorId: vendor.id }) };
      const saved = branch ? await api.patch<VendorBranch>(`/vendor-branches/${branch.id}`, body) : await api.post<VendorBranch>("/vendor-branches", body);
      toast.success(branch ? `${saved.name} updated` : `Depot ${saved.name} added to ${vendor.name}`);
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={branch ? `Edit Depot · ${branch.name}` : "New Depot"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-branch-form" loading={saving}>
            {branch ? "Save" : "Add Depot"}
          </Button>
        </>
      }
    >
      <form id="vendor-branch-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Vendor" required className="sm:col-span-3">
          {fixedVendor || branch ? (
            <Input value={vendor?.name ?? ""} readOnly disabled />
          ) : (
            <VendorPicker value={vendor as Vendor | null} onChange={setVendor} autoFocus />
          )}
        </Field>
        <Field label="Depot Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="e.g. Bengaluru Depot" autoFocus={!!(fixedVendor || branch)} />
        </Field>
        <Field label="Code" hint="Short code on documents">
          <Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={10} placeholder="BLR" />
        </Field>
        <GstinField value={f.gstin} onChange={(g) => set("gstin", g)} onState={(st) => set("state", st)} hint="Its state decides CGST + SGST or IGST on POs from this branch" />
        <Field label="Contact Person">
          <Input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} maxLength={100} />
        </Field>
        <Field label="Phone">
          <Input type="tel" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} placeholder="98765 43210" />
        </Field>
        <Field label="Email" className="sm:col-span-3">
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-3">
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={500} />
        </Field>
        <Field label="City">
          <Input value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
        </Field>
        <StateSelect value={f.state} onChange={(st) => set("state", st)} gstin={f.gstin} />
        <Field label="Pincode">
          <Input inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
        </Field>
        {branch && (
          <div className="sm:col-span-3">
            <Checkbox label="Active (offered on new POs)" checked={isActive} onChange={setIsActive} />
          </div>
        )}
      </form>
    </Modal>
  );
}
