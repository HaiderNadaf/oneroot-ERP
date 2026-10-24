"use client";

import { ClipboardList, HandCoins, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { date, inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PartyPaymentForm, type FixedParty } from "./PartyPaymentForm";
import { Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, StatCard, StatusBadge, Table, Td, Th } from "./ui";

interface Party {
  id: string;
  name: string;
}

interface PoRow {
  id: string;
  poNo: string;
  status: string;
  orderDate: string;
  vendor: Party;
  total: number;
  paid: number;
  pending: number;
}

interface GrnRow {
  id: string;
  grnNo: string;
  receivedAt: string;
  po: { id: string; poNo: string };
  vendor: Party;
  invoice: { id: string; purchaseNo: string; dueDate: string | null } | null;
  value: number;
  paid: number;
  pending: number;
}

/** An approved PO on advance terms with part of its advance still unpaid */
interface AdvanceRow {
  id: string;
  poNo: string;
  status: string;
  orderDate: string;
  vendor: Party;
  paymentTerm: "ADVANCE_FULL" | "ADVANCE_PARTIAL";
  total: number;
  advance: number;
  paid: number;
  pending: number;
}

interface VendorPendingData {
  advance: { count: number; advance: number; paid: number; pending: number; rows: AdvanceRow[] };
  po: { count: number; total: number; paid: number; pending: number; rows: PoRow[] };
  grn: { count: number; value: number; paid: number; pending: number; notInvoiced: number; rows: GrnRow[] };
}

/** Money still owed to vendors: against open approved POs, and against goods already received (GRNs) */
export function VendorPending() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<VendorPendingData>("/payments/vendor-pending");
  // Finance records the payment straight from a row: an advance against a PO, or against a GRN's goods
  const canPay = can("payments.vendor");
  const [paying, setPaying] = useState<FixedParty | null>(null);
  const link = (ok: boolean, href: string, label: ReactNode) =>
    ok ? (
      <Link href={href} className="font-medium text-brand-700 hover:underline">
        {label}
      </Link>
    ) : (
      <span className="font-medium">{label}</span>
    );

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Advances to Pay"
          value={data ? inr(data.advance.pending) : "…"}
          sub={data && `${data.advance.count} PO${data.advance.count === 1 ? "" : "s"} on advance terms · ${inr(data.advance.paid)} paid`}
          icon={<HandCoins />}
          tone="blue"
        />
        <StatCard
          label="Pending Against Approved POs"
          value={data ? inr(data.po.pending) : "…"}
          sub={data && `${data.po.count} open PO${data.po.count === 1 ? "" : "s"} · ${inr(data.po.total)} ordered · ${inr(data.po.paid)} paid`}
          icon={<ClipboardList />}
          tone="amber"
        />
        <StatCard
          label="Pending Against Received GRNs"
          value={data ? inr(data.grn.pending) : "…"}
          sub={
            data &&
            `${data.grn.count} GRN${data.grn.count === 1 ? "" : "s"} · ${inr(data.grn.paid)} paid${
              data.grn.notInvoiced > 0 ? ` · ${inr(data.grn.notInvoiced)} not invoiced yet` : ""
            }`
          }
          icon={<PackageCheck />}
          tone="red"
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Approved POs are those approved or partly received. Goods already received on a partly received PO also appear under GRNs.
      </p>

      <Card title="Advances to Pay — Against PO" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>PO No.</Th>
              <Th>Date</Th>
              <Th>Vendor</Th>
              <Th>Terms</Th>
              <Th right>PO Total</Th>
              <Th right>Advance</Th>
              <Th right>Paid</Th>
              <Th right>To Pay</Th>
              {canPay && <Th />}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={canPay ? 9 : 8} />
            ) : !data?.advance.rows.length ? (
              <EmptyRow colSpan={canPay ? 9 : 8}>No advances waiting to be paid</EmptyRow>
            ) : (
              data.advance.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{link(can("purchases.view"), `/purchase-orders/${r.id}`, r.poNo)}</Td>
                  <Td className="whitespace-nowrap">{date(r.orderDate)}</Td>
                  <Td>{link(can("vendors.view"), `/vendors/${r.vendor.id}`, r.vendor.name)}</Td>
                  <Td>
                    <Badge tone={r.paymentTerm === "ADVANCE_FULL" ? "violet" : "blue"}>{r.paymentTerm === "ADVANCE_FULL" ? "100% Advance" : "Partial Advance"}</Badge>
                  </Td>
                  <Td right>{inr(r.total)}</Td>
                  <Td right>{inr(r.advance)}</Td>
                  <Td right className="text-slate-500">
                    {inr(r.paid)}
                  </Td>
                  <Td right className="font-semibold text-sky-700">
                    {inr(r.pending)}
                  </Td>
                  {canPay && (
                    <Td right>
                      <Button
                        size="sm"
                        onClick={() =>
                          setPaying({ partyType: "VENDOR", partyId: r.vendor.id, partyName: r.vendor.name, poId: r.id, due: r.pending, documentLabel: `the advance on ${r.poNo}` })
                        }
                      >
                        Record Payment
                      </Button>
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Approved POs — Payment Pending" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>PO No.</Th>
              <Th>Date</Th>
              <Th>Vendor</Th>
              <Th>Status</Th>
              <Th right>PO Total</Th>
              <Th right>Paid</Th>
              <Th right>Pending</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data?.po.rows.length ? (
              <EmptyRow colSpan={7}>No payment pending against approved POs</EmptyRow>
            ) : (
              data.po.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{link(can("purchases.view"), `/purchase-orders/${r.id}`, r.poNo)}</Td>
                  <Td className="whitespace-nowrap">{date(r.orderDate)}</Td>
                  <Td>{link(can("vendors.view"), `/vendors/${r.vendor.id}`, r.vendor.name)}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td right>{inr(r.total)}</Td>
                  <Td right className="text-slate-500">
                    {inr(r.paid)}
                  </Td>
                  <Td right className="font-semibold text-amber-700">
                    {inr(r.pending)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Received GRNs — Payment Pending" className="mt-4" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>GRN No.</Th>
              <Th>Received</Th>
              <Th>PO No.</Th>
              <Th>Vendor</Th>
              <Th>Invoice</Th>
              <Th right>Value</Th>
              <Th right>Paid</Th>
              <Th right>Pending</Th>
              {canPay && <Th />}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={canPay ? 9 : 8} />
            ) : !data?.grn.rows.length ? (
              <EmptyRow colSpan={canPay ? 9 : 8}>No payment pending against received GRNs</EmptyRow>
            ) : (
              data.grn.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>{link(can("grn.view"), `/goods-inward/${r.id}`, r.grnNo)}</Td>
                  <Td className="whitespace-nowrap">{date(r.receivedAt)}</Td>
                  <Td>{link(can("purchases.view"), `/purchase-orders/${r.po.id}`, r.po.poNo)}</Td>
                  <Td>{link(can("vendors.view"), `/vendors/${r.vendor.id}`, r.vendor.name)}</Td>
                  <Td>
                    {r.invoice ? (
                      <>
                        {link(can("invoices.view"), `/purchases/${r.invoice.id}`, r.invoice.purchaseNo)}
                        {r.invoice.dueDate && <p className="text-xs text-slate-500">Due {date(r.invoice.dueDate)}</p>}
                      </>
                    ) : (
                      <Badge tone="amber">Not Invoiced</Badge>
                    )}
                  </Td>
                  <Td right>{inr(r.value)}</Td>
                  <Td right className="text-slate-500">
                    {inr(r.paid)}
                  </Td>
                  <Td right className="font-semibold text-red-700">
                    {inr(r.pending)}
                  </Td>
                  {canPay && (
                    <Td right>
                      {r.invoice ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            setPaying({ partyType: "VENDOR", partyId: r.vendor.id, partyName: r.vendor.name, grnId: r.id, due: r.pending, documentLabel: r.grnNo })
                          }
                        >
                          Record Payment
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400" title="Book the invoice from the GRN first">
                          Invoice first
                        </span>
                      )}
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <PartyPaymentForm
        open={!!paying}
        fixed={paying}
        defaultType="VENDOR"
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          void reload();
        }}
      />
    </>
  );
}
