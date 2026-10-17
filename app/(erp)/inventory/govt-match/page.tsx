"use client";

import { CheckCircle2, Save, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { useNeedBranch } from "@/components/BranchNotice";
import { Badge, Button, Card, DateInput, EmptyRow, ErrorBox, Field, Input, PageHeader, Spinner, Table, Td, Textarea, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, qty, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { GovtMatch, GovtMatchRow } from "@/lib/types";

export default function GovtMatchPage() {
  return (
    <RequirePerm perms={["inventory.govt"]}>
      <GovtMatchView />
    </RequirePerm>
  );
}

type Draft = Record<string, { govtSales: string; portalStock: string; note: string }>;

function GovtMatchView() {
  const toast = useToast();
  // Bills open under Invoices; without it the bill numbers are plain text
  const canBill = useAuth().can("sales.bill");
  const needBranch = useNeedBranch("match its figures");
  const [day, setDay] = useState(today());
  const { data, error, loading, reload, setData } = useApi<GovtMatch>(needBranch.blocked ? null : "/govt-fertiliser/match", { date: day });
  // Typed-in figures are kept as overrides per day; anything not touched shows the saved value
  const [over, setOver] = useState<{ day: string; map: Draft }>({ day, map: {} });
  const overrides = over.day === day ? over.map : {};
  const [saving, setSaving] = useState(false);
  const [receipts, setReceipts] = useState("");
  const [check, setCheck] = useState<{ day: string; unmatched: string[]; matched: number } | null>(null);
  const checkResult = check && check.day === day ? check : null;

  const fromRow = (r: GovtMatchRow) => ({ govtSales: r.govtSales === null ? "" : String(r.govtSales), portalStock: r.portalStock === null ? "" : String(r.portalStock), note: r.note ?? "" });
  const draft: Draft = Object.fromEntries((data?.rows ?? []).map((r) => [r.product.id, overrides[r.product.id] ?? fromRow(r)]));
  const set = (id: string, k: keyof Draft[string], v: string) => setOver({ day, map: { ...overrides, [id]: { ...draft[id], [k]: v } } });

  async function save() {
    if (!data) return;
    const rows = data.rows
      .filter((r) => draft[r.product.id]?.govtSales !== "" || draft[r.product.id]?.portalStock !== "")
      .map((r) => ({ productId: r.product.id, govtSales: Number(draft[r.product.id].govtSales) || 0, portalStock: Number(draft[r.product.id].portalStock) || 0, note: draft[r.product.id].note || undefined }));
    if (!rows.length) return toast.error("Enter the portal figures for at least one product");
    setSaving(true);
    try {
      const res = await api.put<GovtMatch>("/govt-fertiliser/match", { date: day, rows });
      setData(res);
      setOver({ day, map: {} });
      const bad = res.rows.filter((r) => r.status === "MISMATCH").length;
      toast.success(bad ? `Saved — ${bad} product${bad > 1 ? "s" : ""} off from the portal` : "Saved — everything matches the portal");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function resolve(r: GovtMatchRow) {
    if (!r.id) return;
    try {
      await api.patch(`/govt-fertiliser/match/${r.id}/resolve`, { note: draft[r.product.id]?.note || undefined });
      toast.success(`${r.product.name} marked resolved`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function checkReceipts() {
    const list = receipts.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return toast.error("Paste the receipt numbers from the govt device first");
    try {
      const res = await api.post<{ unmatched: string[]; matched: number }>("/govt-fertiliser/check-receipts", { date: day, receipts: list });
      setCheck({ day, ...res });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const tone = (s: GovtMatchRow["status"]) => (s === "MATCH" ? "green" : s === "MISMATCH" ? "red" : s === "RESOLVED" ? "slate" : "amber");
  const label = (s: GovtMatchRow["status"]) => (s === "MATCH" ? "Matches" : s === "MISMATCH" ? "Off" : s === "RESOLVED" ? "Resolved" : "Portal figures pending");

  return (
    <>
      <PageHeader
        title="Govt Fertiliser Match"
        subtitle="Daily check that subsidised fertiliser sales and closing stock agree with the government POS portal"
        actions={
          <>
            <DateInput value={day} max={today()} onChange={(e) => setDay(e.target.value)} className="w-40" aria-label="Date" />
            <Button icon={<Save className="size-4" />} loading={saving} onClick={save} disabled={!data?.rows.length}>
              Save Portal Figures
            </Button>
          </>
        }
      />
      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner page />
      ) : data ? (
        <div className="space-y-4">
          {data.subsidisedProducts === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No product is marked <b>Govt-subsidised</b> yet. Tick it on the fertiliser products (Products → Edit) and they will appear here; their bills will then require the govt POS receipt no.
            </div>
          )}
          <Card title={`Sales and Stock · ${date(data.date)}`} bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th right>Our Sales</Th>
                  <Th right>Govt POS Sales</Th>
                  <Th right>Our Closing Stock</Th>
                  <Th right>Portal Stock</Th>
                  <Th>Status</Th>
                  <Th>Note</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {!data.rows.length ? (
                  <EmptyRow colSpan={8}>No subsidised products</EmptyRow>
                ) : (
                  data.rows.map((r) => {
                    const d = draft[r.product.id] ?? { govtSales: "", portalStock: "", note: "" };
                    return (
                      <tr key={r.product.id} className={cx(r.status === "MISMATCH" && "bg-red-50/60")}>
                        <Td>
                          <p className="font-medium text-slate-900">{r.product.name}</p>
                          <p className="text-xs text-slate-500">{r.product.sku}</p>
                        </Td>
                        <Td right className="font-medium">
                          {qty(r.ourSales)} {r.product.unit}
                        </Td>
                        <Td right>
                          <Input type="number" min="0" step="any" value={d.govtSales} onChange={(e) => set(r.product.id, "govtSales", e.target.value)} className={cx("num h-8 w-24 text-right", r.salesOff ? "border-red-400" : "")} aria-label={`Govt sales of ${r.product.name}`} />
                          {r.salesOff ? <p className="text-[11px] font-medium text-red-600">{r.salesOff > 0 ? "+" : ""}{qty(r.salesOff)} off</p> : null}
                        </Td>
                        <Td right className="font-medium">
                          {qty(r.ourStock)} {r.product.unit}
                        </Td>
                        <Td right>
                          <Input type="number" min="0" step="any" value={d.portalStock} onChange={(e) => set(r.product.id, "portalStock", e.target.value)} className={cx("num h-8 w-24 text-right", r.stockOff ? "border-red-400" : "")} aria-label={`Portal stock of ${r.product.name}`} />
                          {r.stockOff ? <p className="text-[11px] font-medium text-red-600">{r.stockOff > 0 ? "+" : ""}{qty(r.stockOff)} off</p> : null}
                        </Td>
                        <Td>
                          <Badge tone={tone(r.status)}>{label(r.status)}</Badge>
                        </Td>
                        <Td>
                          <Input value={d.note} onChange={(e) => set(r.product.id, "note", e.target.value)} placeholder="Reason / action" className="h-8 w-44 text-xs" />
                        </Td>
                        <Td right>
                          {r.status === "MISMATCH" && (
                            <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-4" />} onClick={() => resolve(r)}>
                              Resolve
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
            <p className="px-4 py-2 text-xs text-slate-500">
              Closing stock is as at the end of the chosen day. Type the figures from the portal&apos;s daily report; check with the department whether a download is available — don&apos;t assume a feed.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Govt POS Receipts With No Matching Bill">
              <Field label="Paste receipt numbers from the govt device (one per line)">
                <Textarea rows={4} value={receipts} onChange={(e) => setReceipts(e.target.value)} placeholder={"R2026100612345\nR2026100612346"} className="font-mono text-xs" />
              </Field>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon={<ScanLine className="size-4" />} onClick={checkReceipts}>
                  Check
                </Button>
                {checkResult && (
                  <span className="text-sm text-slate-600">
                    {checkResult.matched} matched · <b className={checkResult.unmatched.length ? "text-red-600" : "text-brand-700"}>{checkResult.unmatched.length} not billed here</b>
                  </span>
                )}
              </div>
              {checkResult && checkResult.unmatched.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {checkResult.unmatched.map((r) => (
                    <li key={r} className="flex items-center justify-between gap-2 break-all rounded-lg bg-red-50 px-3 py-1.5 font-mono text-xs text-red-700">
                      {r}
                      {canBill && (
                        <Link href={`/sales/new`} className="shrink-0 break-normal font-sans font-medium text-brand-700 hover:underline">
                          Bill It
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Bills with a govt receipt no. · ${data.receiptsOnBills.length}`} bodyClassName="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Bill</Th>
                    <Th>Govt Receipt</Th>
                    <Th>Aadhaar</Th>
                    <Th right>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {!data.receiptsOnBills.length ? (
                    <EmptyRow colSpan={4}>No subsidised fertiliser billed on this day</EmptyRow>
                  ) : (
                    data.receiptsOnBills.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <Td>
                          {canBill ? (
                            <Link href={`/sales/${b.id}`} className="font-medium text-brand-700 hover:underline">
                              {b.invoiceNo}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900">{b.invoiceNo}</span>
                          )}
                          <p className="text-xs text-slate-500">{b.customerName ?? "Walk-in"}</p>
                        </Td>
                        <Td className="font-mono text-xs">{b.govtReceiptNo}</Td>
                        <Td>{b.aadhaarVerified ? <Badge tone="green">Verified</Badge> : <Badge>—</Badge>}</Td>
                        <Td right>{inr(b.totalAmount)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
