"use client";

import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { CampaignForm, CampaignStatusBadge } from "@/components/CampaignForm";
import { ActionsTd, ActionsTh, Button, Card, EmptyRow, ErrorBox, LoadingRow, PageHeader, RowAction, SearchInput, Select, Table, Td, Th, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, inr, n, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Campaign } from "@/lib/types";

export default function CampaignsPage() {
  return (
    <RequirePerm perms={["admin.schemes"]}>
      <Campaigns />
    </RequirePerm>
  );
}

function Campaigns() {
  const { can } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<Campaign[]>("/campaigns", { search: q, status });

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Promotions such as a season drive or a launch offer: their schemes apply at the counter while they run, and their results are tracked here"
        actions={
          can("schemes.create") && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              New Campaign
            </Button>
          )
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search campaign name or code…" className="w-full flex-1 sm:w-auto sm:min-w-60" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44" aria-label="Status">
            <option value="">All Campaigns</option>
            <option value="RUNNING">Running</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="ENDED">Ended</option>
            <option value="STOPPED">Stopped</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Period</Th>
                <Th right>Offers</Th>
                <Th right>Bills</Th>
                <Th right>Units</Th>
                <Th right>Sales</Th>
                <Th right>Discount Given</Th>
                <Th>Status</Th>
                <ActionsTh />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={9} />
              ) : !data?.length ? (
                <EmptyRow colSpan={9}>
                  <Megaphone className="mx-auto mb-2 size-7 text-slate-300" />
                  {search || status ? "No campaigns match." : "No campaigns yet — create one, then add the offers it runs."}
                </EmptyRow>
              ) : (
                data.map((c) => {
                  const r = c.results;
                  const budget = c.budget != null ? n(c.budget) : null;
                  const over = budget !== null && r && r.discount > budget;
                  return (
                    <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/campaigns/${c.id}`)}>
                      <Td>
                        <Link href={`/campaigns/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{c.code}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {date(c.from)} – {c.to ? date(c.to) : "open"}
                      </Td>
                      <Td right className="num">
                        {c._count?.schemes ?? 0}
                      </Td>
                      <Td right className="num">
                        {r?.bills ?? 0}
                      </Td>
                      <Td right className="num whitespace-nowrap">
                        {qty(r?.units ?? 0)}
                        {r && r.freeUnits > 0 && <span className="block text-[11px] text-slate-500">+{qty(r.freeUnits)} free</span>}
                      </Td>
                      <Td right className="num whitespace-nowrap font-semibold text-slate-900">
                        {inr(r?.sales ?? 0)}
                      </Td>
                      <Td right className="num whitespace-nowrap">
                        <span className={cx(over && "font-semibold text-red-600")}>{inr(r?.discount ?? 0)}</span>
                        {budget !== null && <span className="block text-[11px] text-slate-500">of {inr(budget)} budget</span>}
                      </Td>
                      <Td>
                        <CampaignStatusBadge status={c.status} />
                      </Td>
                      <ActionsTd>
                        <span onClick={(e) => e.stopPropagation()} className="contents">
                          <RowAction kind="view" href={`/campaigns/${c.id}`} title={`View ${c.name}`} />
                          {can("schemes.edit") && <RowAction kind="edit" title={`Edit ${c.name}`} onClick={() => setEditing(c)} />}
                        </span>
                      </ActionsTd>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <CampaignForm
          campaign={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            const isNew = editing === "new";
            setEditing(null);
            if (isNew) router.push(`/campaigns/${c.id}`);
            else void reload();
          }}
        />
      )}
    </>
  );
}
