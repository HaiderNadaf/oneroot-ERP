"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CustomerForm } from "@/components/CustomerForm";
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
import { downloadCsv, inr, n, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Customer, Paged } from "@/lib/types";

export default function CustomersPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [withDues, setWithDues] = useState(false);
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);

  const filters = { search: q, withDues: withDues ? "true" : undefined, status };
  const { data, error, loading, reload } = useApi<Paged<Customer>>("/customers", { ...filters, page, pageSize: 25 });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Customer>>("/customers", { ...filters, pageSize: 500 });
      downloadCsv(
        withDues ? "customer_dues.csv" : "customers.csv",
        ["Name", "Phone", "Email", "GSTIN", "Village", "Address", "City", "State", "PIN", "Land (acres)", "Crops", "Credit limit", "Opening balance", "Balance due", "Active"],
        all.items.map((c) => [
          c.name,
          c.phone,
          c.email,
          c.gstin,
          c.village,
          c.address,
          c.city,
          c.state,
          c.pincode,
          c.landAcres === null || c.landAcres === undefined ? "" : n(c.landAcres),
          c.crops,
          n(c.creditLimit),
          n(c.openingBalance),
          n(c.balance),
          c.isActive ? "Yes" : "No",
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Farmers and dealers you sell to, with their dues"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
              Export
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={openNew}>
              New customer
            </Button>
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
            placeholder="Search name, phone, village…"
            className="min-w-60 flex-1"
          />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-32" aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <div className="px-1">
            <Checkbox label="With dues only" checked={withDues} onChange={(v) => (setWithDues(v), setPage(1))} />
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
                <Th>Customer</Th>
                <Th>Phone</Th>
                <Th>Village</Th>
                <Th>Crops</Th>
                <Th right>Credit limit</Th>
                <Th right>Balance due</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={7}>
                  {withDues ? (
                    "No customers with pending dues"
                  ) : (
                    <>
                      No customers found.{" "}
                      <button className="font-medium text-brand-700 underline" onClick={openNew}>
                        Add a customer
                      </button>
                    </>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((c) => {
                  const bal = n(c.balance);
                  const limit = n(c.creditLimit);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                          {c.name}
                        </Link>
                        {!c.isActive && (
                          <span className="ml-1.5">
                            <Badge>Inactive</Badge>
                          </span>
                        )}
                        {(c.gstin || n(c.landAcres) > 0) && (
                          <p className="text-xs text-slate-500">
                            {[c.gstin, n(c.landAcres) > 0 ? `${qty(c.landAcres)} acres` : null].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{c.phone || <span className="text-slate-400">—</span>}</Td>
                      <Td>{c.village || <span className="text-slate-400">—</span>}</Td>
                      <Td className="max-w-56 truncate text-xs text-slate-600">{c.crops || <span className="text-slate-400">—</span>}</Td>
                      <Td right className="text-slate-500">
                        {limit > 0 ? inr(limit) : "—"}
                      </Td>
                      <Td right>
                        {bal > 0 ? (
                          <span className="font-semibold text-red-600">{inr(bal)}</span>
                        ) : bal < 0 ? (
                          <span className="text-brand-700" title="Advance paid by customer">
                            {inr(-bal)} adv
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {limit > 0 && bal > limit && <p className="text-[11px] text-red-600">over limit</p>}
                      </Td>
                      <ActionsTd>
                        <RowAction kind="view" href={`/customers/${c.id}`} title={`View ${c.name}`} />
                        <RowAction
                          kind="edit"
                          title={`Edit ${c.name}`}
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                        />
                      </ActionsTd>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <CustomerForm
        open={formOpen}
        customer={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}
