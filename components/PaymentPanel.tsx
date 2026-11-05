"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { date, inr, n } from "@/lib/format";
import { modeLabel, type GrnPayment, type PoPayment } from "@/lib/types";
import { PartyPaymentForm, type FixedParty } from "./PartyPaymentForm";
import { Badge, Button, Card, StatusBadge, Table, Td, Th } from "./ui";

/** Something finance can mark paid from the panel: the PO's advance, or one GRN's invoice */
interface PayTarget {
  key: string;
  label: string;
  party: FixedParty;
}

/**
 * Payment status of a PO or GRN, the transactions recorded against it (txn no. / cheque no.),
 * and a Payment Done button for finance that opens the payment popup.
 */
export function PaymentPanel({
  payment,
  vendor,
  poId,
  grnId,
  docNo,
  onPaid,
  className,
}: {
  payment: PoPayment | GrnPayment;
  vendor: { id: string; name: string };
  /** On a PO page: its id (advance payments go against it) */
  poId?: string;
  /** On a GRN page: its id (payment goes against its invoice) */
  grnId?: string;
  docNo: string;
  onPaid: () => void;
  className?: string;
}) {
  const { can } = useAuth();
  const [paying, setPaying] = useState<FixedParty | null>(null);
  const party = { partyType: "VENDOR" as const, partyId: vendor.id, partyName: vendor.name };

  const targets: PayTarget[] = [];
  if (can("payments.vendor")) {
    if ("advanceDue" in payment) {
      if (poId && payment.advanceDue > 0.005)
        targets.push({ key: "advance", label: `Advance · ${inr(payment.advanceDue)}`, party: { ...party, poId, due: payment.advanceDue, documentLabel: `the advance on ${docNo}` } });
      for (const g of payment.grns)
        targets.push({ key: g.id, label: `${g.grnNo} · ${inr(g.due)}`, party: { ...party, grnId: g.id, due: g.due, documentLabel: g.grnNo } });
    } else if (grnId && payment.status !== "NOT_INVOICED" && payment.due > 0.005) {
      targets.push({ key: grnId, label: "", party: { ...party, grnId, due: payment.due, documentLabel: docNo } });
    }
  }

  return (
    <Card
      className={className}
      bodyClassName="p-0"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="size-4 text-slate-400" /> Payment
        </span>
      }
      actions={payment.status === "NOT_INVOICED" ? <Badge tone="amber">Not Invoiced</Badge> : <StatusBadge status={payment.status} />}
    >
      <div className="grid grid-cols-3 gap-3 border-b border-slate-100 px-3 py-3 text-sm sm:px-4">
        <Amount label="Total" value={payment.total} />
        <Amount label="Paid" value={payment.paid} tone="text-brand-700" />
        <Amount label="Due" value={payment.due} tone={payment.due > 0.005 ? "text-red-700" : "text-slate-700"} />
      </div>

      {payment.status === "NOT_INVOICED" && (
        <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 sm:px-4">Book the vendor invoice from this GRN before recording payment.</p>
      )}

      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          {targets.map((t) => (
            <Button key={t.key} size="sm" onClick={() => setPaying(t.party)}>
              Payment Done{t.label && ` — ${t.label}`}
            </Button>
          ))}
        </div>
      )}

      {!payment.transactions.length ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">No payments recorded yet</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Payment No.</Th>
              <Th>Date</Th>
              <Th>Mode</Th>
              <Th>Transaction Details</Th>
              {"advanceDue" in payment && <Th>Against</Th>}
              <Th>By</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {payment.transactions.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <Td className="font-medium">{t.paymentNo}</Td>
                <Td className="whitespace-nowrap">{date(t.paymentDate)}</Td>
                <Td>{modeLabel(t.mode)}</Td>
                <Td className="font-mono text-xs">{t.reference || <span className="font-sans text-slate-400">—</span>}</Td>
                {"advanceDue" in payment && <Td>{t.grn ? t.grn.grnNo : "Advance"}</Td>}
                <Td className="text-slate-500">{t.user?.name ?? "—"}</Td>
                <Td right className="font-semibold">
                  {inr(n(t.amount))}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <PartyPaymentForm
        open={!!paying}
        fixed={paying}
        defaultType="VENDOR"
        onClose={() => setPaying(null)}
        onSaved={() => {
          setPaying(null);
          onPaid();
        }}
      />
    </Card>
  );
}

function Amount({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`num break-words font-semibold ${tone}`}>{inr(value)}</p>
    </div>
  );
}
