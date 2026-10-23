"use client";

import { ArrowLeft, Ban, Gift, IndianRupee, Pencil, Play, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { CampaignForm, CampaignStatusBadge } from "@/components/CampaignForm";
import { SchemeForm, describeScheme } from "@/components/SchemeForm";
import { ActionsTd, ActionsTh, Badge, Button, Card, EmptyRow, ErrorBox, PageHeader, RowAction, Spinner, StatCard, Table, Td, Th, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CampaignDetail, Scheme } from "@/lib/types";

export default function CampaignPage() {
  return (
    <RequirePerm perms={["admin.schemes"]}>
      <CampaignView />
    </RequirePerm>
  );
}

function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: c, error, loading, reload } = useApi<CampaignDetail>(`/campaigns/${id}`);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState<Scheme | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  if (error && !c) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !c) return <Spinner page />;
  if (!c) return null;

  const r = c.results;
  const budget = c.budget != null ? n(c.budget) : null;
  const left = budget !== null ? round2(budget - r.discount) : null;

  async function act(path: "stop" | "restart") {
    if (path === "stop" && !(await confirm(`Stop ${c!.name}? Its offers stop applying at the counter straight away. You can restart it later.`, { danger: true, confirmLabel: "Stop Campaign" })))
      return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${id}/${path}`);
      toast.success(path === "stop" ? "Campaign stopped — its offers no longer apply" : "Campaign restarted");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm(`Delete ${c!.name}? If bills used its offers it is stopped instead, so its results stay. Its schemes are kept as standalone schemes.`, { danger: true, confirmLabel: "Delete" })))
      return;
    try {
      const res = await api.del<{ deleted: boolean }>(`/campaigns/${id}`);
      toast.success(res.deleted ? "Campaign deleted" : "Campaign stopped (bills used its offers)");
      if (res.deleted) router.push("/campaigns");
      else await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function removeOffer(s: Scheme) {
    if (!(await confirm(`Delete offer "${s.name}"? If bills used it, it is switched off instead.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      const res = await api.del<{ deleted: boolean }>(`/schemes/${s.id}`);
      toast.success(res.deleted ? "Offer deleted" : "Offer switched off (bills used it)");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Campaigns
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-600">{c.code}</span>
            <CampaignStatusBadge status={c.status} />
          </span>
        }
        subtitle={`${date(c.from)} – ${c.to ? date(c.to) : "until stopped"}${c.description ? ` · ${c.description}` : ""}`}
        actions={
          <>
            {can("schemes.edit") && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {can("schemes.edit") &&
              (c.isActive ? (
                <Button variant="secondary" icon={<Ban className="size-4" />} onClick={() => void act("stop")} loading={busy}>
                  Stop
                </Button>
              ) : (
                <Button variant="secondary" icon={<Play className="size-4" />} onClick={() => void act("restart")} loading={busy}>
                  Restart
                </Button>
              ))}
            {can("schemes.delete") && (
              <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales Under Offers" value={inr(r.sales)} icon={<IndianRupee />} tone="green" sub={`${qty(r.units)} units sold`} />
        <StatCard label="Bills" value={r.bills} icon={<ReceiptText />} tone="blue" sub={r.bills ? `Avg ${inr(round2(r.sales / r.bills))} on offer lines` : "No bills yet"} />
        <StatCard label="Discount Given" value={inr(r.discount)} icon={<Gift />} tone={left !== null && left < 0 ? "red" : "amber"} sub={r.freeUnits ? `incl. ${qty(r.freeUnits)} free units` : "Scheme discount only"} />
        <StatCard
          label="Budget"
          value={budget !== null ? inr(budget) : "—"}
          icon={<Wallet />}
          tone={left !== null && left < 0 ? "red" : "slate"}
          sub={left === null ? "No budget set" : left >= 0 ? `${inr(left)} left` : `${inr(-left)} over budget`}
        />
      </div>

      <Card
        className="mb-4"
        bodyClassName="p-0"
        title={`Offers (${c.schemes.length})`}
        actions={
          can("schemes.create") && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOffer("new")}>
              Add Offer
            </Button>
          )
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>Offer</Th>
              <Th>Deal</Th>
              <Th>Products</Th>
              <Th>Period</Th>
              <Th>Claim</Th>
              <Th right>Used On</Th>
              <Th>Status</Th>
              <ActionsTh />
            </tr>
          </thead>
          <tbody>
            {!c.schemes.length ? (
              <EmptyRow colSpan={8}>No offers yet — add a buy-X-get-Y, % off or ₹ off scheme for the products this campaign promotes</EmptyRow>
            ) : (
              c.schemes.map((s) => (
                <tr key={s.id} className={cx("hover:bg-slate-50", !s.isActive && "opacity-60")}>
                  <Td className="font-medium text-slate-900">
                    {s.name}
                    {s.notes && <p className="text-xs font-normal text-slate-500">{s.notes}</p>}
                  </Td>
                  <Td className="whitespace-nowrap">{describeScheme(s)}</Td>
                  <Td className="max-w-xs text-xs text-slate-600">{s.products.map((p) => p.product?.name ?? p.productId).join(", ")}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {date(s.from)} – {s.to ? date(s.to) : "open"}
                  </Td>
                  <Td>{s.claimable ? <Badge tone="blue">From Company</Badge> : <Badge>Own Cost</Badge>}</Td>
                  <Td right>{s._count?.saleItems ?? 0} lines</Td>
                  <Td>{s.isActive ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</Td>
                  <ActionsTd>
                    {can("schemes.edit") && <RowAction kind="edit" title={`Edit ${s.name}`} onClick={() => setOffer(s)} />}
                    {can("schemes.delete") && <RowAction kind="delete" title={`Delete ${s.name}`} onClick={() => void removeOffer(s)} />}
                  </ActionsTd>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        {c.status !== "RUNNING" && c.schemes.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-amber-700">
            {c.status === "UPCOMING" ? `These offers start applying on ${date(c.from)}.` : "The campaign isn't running, so these offers don't apply at the counter."}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="By Product" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th right>Sold</Th>
                <Th right>Free</Th>
                <Th right>Sales</Th>
                <Th right>Discount</Th>
              </tr>
            </thead>
            <tbody>
              {!r.products.length ? (
                <EmptyRow colSpan={5}>Nothing sold under these offers yet</EmptyRow>
              ) : (
                r.products.map((p) => (
                  <tr key={p.productId}>
                    <Td className="font-medium text-slate-900">{p.name}</Td>
                    <Td right className="num">
                      {qty(p.quantity)}
                    </Td>
                    <Td right className="num text-slate-500">
                      {p.freeQty ? qty(p.freeQty) : "—"}
                    </Td>
                    <Td right className="num whitespace-nowrap">
                      {inr(p.sales)}
                    </Td>
                    <Td right className="num whitespace-nowrap text-amber-700">
                      {inr(p.discount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <Card title="Bills Under This Campaign" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th right>Bill Total</Th>
              </tr>
            </thead>
            <tbody>
              {!c.recentBills.length ? (
                <EmptyRow colSpan={4}>No bills yet</EmptyRow>
              ) : (
                c.recentBills.map((b) => (
                  <tr key={b.id}>
                    <Td className="whitespace-nowrap font-medium">
                      {can("sales.view") ? (
                        <Link href={`/sales/${b.id}`} className="text-brand-700 hover:underline">
                          {b.invoiceNo}
                        </Link>
                      ) : (
                        b.invoiceNo
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{date(b.saleDate)}</Td>
                    <Td>
                      {b.customer?.name ?? b.customerName ?? "Walk-in"}
                      {b.branch && <p className="text-xs text-slate-500">{b.branch.name}</p>}
                    </Td>
                    <Td right className="num whitespace-nowrap">
                      {inr(b.totalAmount)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          {r.bills > c.recentBills.length && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Latest {c.recentBills.length} of {r.bills} bills.</p>}
        </Card>
      </div>

      {c.notes && (
        <Card title="Notes" className="mt-4">
          <p className="whitespace-pre-line text-sm text-slate-700">{c.notes}</p>
        </Card>
      )}

      {editing && (
        <CampaignForm
          campaign={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
      {offer && (
        <SchemeForm
          scheme={offer === "new" ? null : offer}
          campaign={c}
          onClose={() => setOffer(null)}
          onSaved={() => {
            setOffer(null);
            void reload();
          }}
        />
      )}
    </>
  );
}
