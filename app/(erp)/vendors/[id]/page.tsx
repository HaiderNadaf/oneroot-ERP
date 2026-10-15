"use client";

import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  Pencil,
  Printer,
  ReceiptIndianRupee,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PartyPaymentForm, modeLabel, type FixedParty } from "@/components/PartyPaymentForm";
import { VendorForm } from "@/components/VendorForm";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  Info,
  LoadingRow,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, n } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { Dec, Ledger, Paged, Payment, Purchase, StoreSettings, Vendor } from "@/lib/types";

type VendorDetail = Vendor & {
  stats: { totalPurchases: Dec; billCount: number; lastPurchase: string | null };
  recentPurchases: Pick<
    Purchase,
    "id" | "purchaseNo" | "vendorInvoiceNo" | "purchaseDate" | "totalAmount" | "paidAmount" | "paymentStatus" | "status"
  >[];
};

type Tab = "ledger" | "purchases" | "payments";

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const canBuy = can("purchases.manage");
  const [tab, setTab] = useState<Tab>("ledger");
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [ledgerKey, setLedgerKey] = useState(0);

  const { data: v, error, loading, reload } = useApi<VendorDetail>(`/vendors/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");

  const fixed = useMemo<FixedParty | null>(
    () => (v ? { partyType: "VENDOR", partyId: v.id, partyName: v.name, balance: n(v.balance) } : null),
    [v],
  );

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !v) return <Spinner page />;
  if (!v) return null;

  const bal = n(v.balance);

  return (
    <>
      <div className="no-print mb-2">
        <Link href="/vendors" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Vendors
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {v.name}
            {!v.isActive && <Badge>Inactive</Badge>}
          </span>
        }
        subtitle={[v.contactPerson, v.phone, v.gstin && `GSTIN ${v.gstin}`].filter(Boolean).join(" · ") || "Vendor"}
        actions={
          <>
            {canBuy && (
              <>
                <Button
                  variant="secondary"
                  icon={<ClipboardList className="size-4" />}
                  onClick={() => router.push(`/purchase-orders/new?vendorId=${v.id}`)}
                >
                  New PO
                </Button>
                <Button
                  variant="secondary"
                  icon={<ShoppingCart className="size-4" />}
                  onClick={() => router.push(`/purchases/new?vendorId=${v.id}`)}
                >
                  New purchase
                </Button>
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              </>
            )}
            <Button icon={<Banknote className="size-4" />} onClick={() => setPayOpen(true)}>
              Pay vendor
            </Button>
          </>
        }
      />

      <div className="no-print mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={bal < 0 ? "Advance with vendor" : "Payable balance"}
          value={inr(Math.abs(bal))}
          tone={bal > 0 ? "amber" : "green"}
          icon={<Wallet />}
          sub={bal > 0 ? "You owe this vendor" : bal < 0 ? "Paid in advance" : "All settled"}
        />
        <StatCard label="Total purchases" value={inr(v.stats.totalPurchases)} icon={<ReceiptIndianRupee />} tone="blue" />
        <StatCard label="Bills" value={v.stats.billCount} icon={<FileText />} sub="Completed purchase bills" />
        <StatCard
          label="Last purchase"
          value={<span className="text-lg">{date(v.stats.lastPurchase)}</span>}
          icon={<CalendarClock />}
          sub={v.paymentTermsDays ? `Terms: ${v.paymentTermsDays} days credit` : "Terms: immediate payment"}
        />
      </div>

      <div className="no-print mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Contact">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info label="Contact person">{v.contactPerson}</Info>
            <Info label="Phone">{v.phone && <a href={`tel:${v.phone}`} className="hover:text-brand-700">{v.phone}</a>}</Info>
            <Info label="Email">{v.email && <a href={`mailto:${v.email}`} className="hover:text-brand-700">{v.email}</a>}</Info>
            <Info label="GSTIN">{v.gstin && <span className="font-mono">{v.gstin}</span>}</Info>
            <Info label="Place of supply">{placeOfSupply(v, store).label}</Info>
            <div className="col-span-2">
              <Info label="Address">{[v.address, v.city, v.state, v.pincode].filter(Boolean).join(", ")}</Info>
            </div>
            {v.notes && (
              <div className="col-span-2">
                <Info label="Notes">{v.notes}</Info>
              </div>
            )}
          </dl>
        </Card>
        <Card title="Bank details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info label="Bank">{v.bankName}</Info>
            <Info label="IFSC">{v.ifsc && <span className="font-mono">{v.ifsc}</span>}</Info>
            <Info label="Account number">{v.bankAccount && <span className="font-mono">{v.bankAccount}</span>}</Info>
            <Info label="Opening balance">{inr(v.openingBalance)}</Info>
          </dl>
        </Card>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ledger", label: "Ledger" },
          ...(canBuy ? [{ value: "purchases" as Tab, label: `Purchases (${v.stats.billCount})` }] : []),
          { value: "payments", label: "Payments" },
        ]}
      />

      {tab === "ledger" && <VendorLedger key={ledgerKey} vendor={v} />}
      {tab === "purchases" && canBuy && <VendorPurchases vendorId={v.id} />}
      {tab === "payments" && <VendorPayments key={ledgerKey} vendorId={v.id} />}

      <VendorForm
        open={editOpen}
        vendor={v}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void reload();
          setLedgerKey((k) => k + 1);
        }}
      />
      <PartyPaymentForm
        open={payOpen}
        fixed={fixed}
        onClose={() => setPayOpen(false)}
        onSaved={() => {
          setPayOpen(false);
          void reload();
          setLedgerKey((k) => k + 1);
        }}
      />
    </>
  );
}

const LEDGER_TONE: Record<string, "blue" | "green" | "red" | "violet"> = {
  Purchase: "blue",
  Payment: "green",
  "Debit note": "red",
  "Credit note": "violet",
};

function VendorLedger({ vendor }: { vendor: Vendor }) {
  const { data, error, loading, reload } = useApi<Ledger<Vendor>>(`/vendors/${vendor.id}/ledger`);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `ledger-${vendor.name.replace(/\W+/g, "-").toLowerCase()}.csv`,
      ["Date", "Type", "Reference", "Note", "Bill amount (Dr)", "Paid (Cr)", "Balance"],
      [
        ["", "Opening balance", "", "", "", "", data.openingBalance],
        ...data.entries.map((e) => [date(e.date), e.type, e.refNo, e.note, e.debit || "", e.credit || "", e.balance]),
        ["", "Closing balance", "", "", data.totalDebit, data.totalCredit, data.closingBalance],
      ],
    );
  }

  const balText = (b: number) => (b < 0 ? `${inr(-b)} Adv` : inr(b));

  return (
    <Card
      className="print-area"
      bodyClassName="p-0"
      title={<span className="no-print">Account statement</span>}
      actions={
        <div className="no-print flex gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!data}>
            Print
          </Button>
        </div>
      }
    >
      <div className="hidden px-3 pb-3 print:block">
        <h2 className="text-lg font-semibold">Vendor ledger — {vendor.name}</h2>
        <p className="text-xs text-slate-600">
          {[vendor.gstin && `GSTIN ${vendor.gstin}`, vendor.phone, [vendor.address, vendor.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-slate-600">Printed {date(new Date())}</p>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th>Note</Th>
              <Th right>Bill (Dr)</Th>
              <Th right>Paid / notes (Cr)</Th>
              <Th right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data ? null : (
              <>
                <tr className="bg-slate-50/60">
                  <Td colSpan={6} className="font-medium text-slate-600">
                    Opening balance
                  </Td>
                  <Td right className="font-medium">
                    {balText(data.openingBalance)}
                  </Td>
                </tr>
                {data.entries.length === 0 && <EmptyRow colSpan={7}>No bills or payments yet</EmptyRow>}
                {data.entries.map((e, i) => (
                  <tr key={`${e.refId ?? e.refNo}-${i}`} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{date(e.date)}</Td>
                    <Td>
                      <Badge tone={LEDGER_TONE[e.type] ?? "slate"}>{e.type}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {e.type === "Purchase" && e.refId ? (
                        <Link href={`/purchases/${e.refId}`} className="font-medium text-brand-700 hover:underline">
                          {e.refNo}
                        </Link>
                      ) : (e.type === "Debit note" || e.type === "Credit note") && e.refId ? (
                        <Link
                          href={`/debit-notes${e.type === "Credit note" ? "?type=credit" : ""}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {e.refNo}
                        </Link>
                      ) : (
                        e.refNo
                      )}
                    </Td>
                    <Td className="max-w-64 truncate text-xs text-slate-500">{e.note || ""}</Td>
                    <Td right>{e.debit ? inr(e.debit) : ""}</Td>
                    <Td right className="text-brand-700">
                      {e.credit ? inr(e.credit) : ""}
                    </Td>
                    <Td right className={cx("font-medium", e.balance > 0 ? "text-slate-900" : "text-brand-700")}>
                      {balText(e.balance)}
                    </Td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
          {data && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={4} className="text-slate-700">
                  Closing balance
                </Td>
                <Td right>{inr(data.totalDebit)}</Td>
                <Td right className="text-brand-700">
                  {inr(data.totalCredit)}
                </Td>
                <Td right className={data.closingBalance > 0 ? "text-amber-700" : "text-brand-700"}>
                  {balText(data.closingBalance)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </Card>
  );
}

function VendorPurchases({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Purchase>>("/purchases", { vendorId, status: "all", page, pageSize: 20 });

  return (
    <Card bodyClassName="p-0">
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bill no.</Th>
              <Th>Vendor invoice</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th right>Total</Th>
              <Th right>Paid</Th>
              <Th right>Balance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={8} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={8}>No purchases from this vendor yet</EmptyRow>
            ) : (
              data.items.map((p) => {
                const due = p.status === "COMPLETED" ? n(p.totalAmount) - n(p.paidAmount) : 0;
                return (
                  <tr key={p.id} className={cx("hover:bg-slate-50", p.status === "CANCELLED" && "opacity-60")}>
                    <Td>
                      <Link href={`/purchases/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {p.purchaseNo}
                      </Link>
                    </Td>
                    <Td>{p.vendorInvoiceNo || "—"}</Td>
                    <Td className="whitespace-nowrap">{date(p.purchaseDate)}</Td>
                    <Td className="whitespace-nowrap">{date(p.dueDate)}</Td>
                    <Td right>{inr(p.totalAmount)}</Td>
                    <Td right className="text-slate-500">
                      {inr(p.paidAmount)}
                    </Td>
                    <Td right className={due > 0 ? "font-medium text-amber-700" : "text-slate-400"}>
                      {inr(due)}
                    </Td>
                    <Td>
                      {p.status === "CANCELLED" ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={p.paymentStatus} />}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}

function VendorPayments({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Payment>>("/payments", { partyId: vendorId, page, pageSize: 20 });

  return (
    <Card bodyClassName="p-0">
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Payment no.</Th>
              <Th>Date</Th>
              <Th>Against</Th>
              <Th>Mode</Th>
              <Th>Reference</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={6} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={6}>No payments made to this vendor yet</EmptyRow>
            ) : (
              data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{p.paymentNo}</Td>
                  <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                  <Td>
                    {p.purchase ? (
                      <Link href={`/purchases/${p.purchase.id}`} className="text-brand-700 hover:underline">
                        {p.purchase.purchaseNo}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">On account</span>
                    )}
                  </Td>
                  <Td>{modeLabel(p.mode)}</Td>
                  <Td className="text-slate-500">{p.reference || "—"}</Td>
                  <Td right className="font-medium">
                    {inr(p.amount)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {!!data?.items.length && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={5} className="text-right text-xs uppercase tracking-wide text-slate-500">
                  Total paid
                </Td>
                <Td right>{inr(data.totalAmount)}</Td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}
