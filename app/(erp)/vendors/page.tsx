"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ActionsTd,
  ActionsTh,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  RowAction,
  SearchInput,
  Select,
  Table,
  Td,
  Th,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadCsv, inr, n } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import { parseGstin, placeOfSupply } from "@/lib/gst";
import type { Paged, StoreSettings, Vendor } from "@/lib/types";
import { LazyVendorForm } from "@/components/lazy";

export default function VendorsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [withDues, setWithDues] = useState(false);
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const canCreate = can("vendors.create");
  const canEdit = can("vendors.edit");

  const filters = { search: q, withDues: withDues ? "true" : undefined, status };
  const { data, error, loading, reload } = useApi<Paged<Vendor>>("/vendors", { ...filters, page, pageSize: 25 });
  const { data: store } = useApi<StoreSettings>("/settings");

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Vendor>>("/vendors", { ...filters, pageSize: 500 });
      downloadCsv(
        "vendors.csv",
        ["Code", "Name", "Contact Person", "Phone", "Email", "GSTIN", "Address", "City", "State", "Pincode", "Bank", "Account No", "IFSC", "Payment Terms (Days)", "Opening Balance", "Payable Balance", "Active"],
        all.items.map((v) => [
          v.code,
          v.name,
          v.contactPerson,
          v.phone,
          v.email,
          v.gstin,
          v.address,
          v.city,
          v.state,
          v.pincode,
          v.bankName,
          v.bankAccount,
          v.ifsc,
          v.paymentTermsDays,
          n(v.openingBalance),
          n(v.balance),
          v.isActive ? "Yes" : "No",
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  const pageDues = data?.items.reduce((s, v) => s + Math.max(n(v.balance), 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers, distributors and companies you buy from"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
              Export
            </Button>
            {canCreate && (
              <Button icon={<Plus className="size-4" />} onClick={openNew}>
                New Vendor
              </Button>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search code, name, phone, GSTIN…"
            className="min-w-full flex-1 sm:min-w-60"
          />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-32">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <div className="px-1">
            <Checkbox label="With Dues Only" checked={withDues} onChange={(v) => (setWithDues(v), setPage(1))} />
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Vendor</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>GSTIN</Th>
                <Th>State / Place of Supply</Th>
                <Th right>Terms</Th>
                <Th right>Payable</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={9} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={9}>
                  {search || withDues ? "No vendors match these filters." : "No vendors yet."}{" "}
                  {canCreate && !search && !withDues && (
                    <button className="font-medium text-brand-700 underline" onClick={openNew}>
                      Add Your First Vendor
                    </button>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((v) => {
                  const bal = n(v.balance);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap font-mono text-xs text-slate-600">{v.code ?? "—"}</Td>
                      <Td className="min-w-40">
                        <Link href={`/vendors/${v.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {v.name}
                        </Link>
                        {!v.isActive && (
                          <span className="ml-1.5">
                            <Badge>Inactive</Badge>
                          </span>
                        )}
                        {v.city && <p className="text-xs text-slate-500">{[v.city, v.state].filter(Boolean).join(", ")}</p>}
                      </Td>
                      <Td>{v.contactPerson || "—"}</Td>
                      <Td className="whitespace-nowrap">{v.phone ? <a href={`tel:${v.phone}`} className="hover:text-brand-700">{v.phone}</a> : "—"}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{v.gstin || "—"}</Td>
                      <Td>
                        <VendorState vendor={v} store={store} />
                      </Td>
                      <Td right className="text-slate-500">
                        {v.paymentTermsDays ? `${v.paymentTermsDays} days` : "Immediate"}
                      </Td>
                      <Td right>
                        {bal > 0 ? (
                          <span className="font-semibold text-amber-700">{inr(bal)}</span>
                        ) : bal < 0 ? (
                          <span className="text-brand-700" title="Advance paid to vendor">
                            {inr(-bal)} adv.
                          </span>
                        ) : (
                          <span className="text-slate-400">{inr(0)}</span>
                        )}
                      </Td>
                      <ActionsTd>
                        <RowAction kind="view" href={`/vendors/${v.id}`} title={`View ${v.name}`} />
                        {canEdit && (
                          <RowAction
                            kind="edit"
                            title={`Edit ${v.name}`}
                            onClick={() => {
                              setEditing(v);
                              setFormOpen(true);
                            }}
                          />
                        )}
                      </ActionsTd>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!!data?.items.length && pageDues > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-medium">
                  <Td colSpan={6} className="text-right text-xs uppercase tracking-wide text-slate-500">
                    Payable on this page
                  </Td>
                  <Td right className="font-semibold text-amber-700">
                    {inr(pageDues)}
                  </Td>
                  <Td />
                </tr>
              </tfoot>
            )}
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <LazyVendorForm
        open={formOpen}
        vendor={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

/** State from the GSTIN (or the saved state), the tax type it means, and a warning for a malformed GSTIN */
function VendorState({ vendor, store }: { vendor: Vendor; store: StoreSettings | null }) {
  const gst = parseGstin(vendor.gstin);
  const pos = placeOfSupply(vendor, store);
  return (
    <div className="text-xs">
      <p className="text-sm text-slate-800">
        {pos.name ?? <span className="text-slate-400">—</span>}
        {gst.valid && gst.stateCode && <span className="ml-1 text-slate-400">({gst.stateCode})</span>}
      </p>
      {pos.taxType && <p className={pos.interState ? "text-amber-700" : "text-brand-700"}>{pos.taxType}</p>}
      {!gst.empty && !gst.valid && <p className="text-red-600">Check GSTIN</p>}
    </div>
  );
}
