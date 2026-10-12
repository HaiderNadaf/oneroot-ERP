"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BalanceSheetTab, ChartTab, DayBookTab, LedgerTab, PartiesTab, PnlTab, TallyTab, TrialBalanceTab } from "@/components/accounts/AccountsTabs";
import { RequirePerm } from "@/components/AppShell";
import { RangeBar, type Range } from "@/components/reports/ReportKit";
import { PageHeader, Tabs } from "@/components/ui";
import { today } from "@/lib/format";

const TABS = [
  { value: "chart", label: "Chart of accounts" },
  { value: "daybook", label: "Day book" },
  { value: "ledger", label: "Ledger" },
  { value: "parties", label: "Debtors / creditors" },
  { value: "tb", label: "Trial balance" },
  { value: "pl", label: "Profit & Loss" },
  { value: "bs", label: "Balance sheet" },
  { value: "tally", label: "Tally export" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/** Financial year to date (1 April onwards) */
function fyRange(): Range {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: today(new Date(y, 3, 1)), to: today() };
}

export default function AccountsPage() {
  return (
    <RequirePerm perms={["accounts.view"]}>
      <Accounts />
    </RequirePerm>
  );
}

function Accounts() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === fromUrl) ? (fromUrl as Tab) : "chart";
  const [range, setRange] = useState<Range>(fyRange);
  const setTab = (t: Tab) => router.replace(`/accounts?tab=${t}`, { scroll: false });
  const rangeBar = <RangeBar value={range} onChange={setRange} />;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Double-entry books kept automatically from every bill, payment and expense — ledgers, trial balance, P&L, balance sheet and Tally export"
      />
      <Tabs<Tab> tabs={[...TABS]} value={tab} onChange={setTab} />
      {tab === "chart" && <ChartTab />}
      {tab === "daybook" && <DayBookTab range={range} rangeBar={rangeBar} />}
      {tab === "ledger" && <LedgerTab range={range} rangeBar={rangeBar} initialAccountId={params.get("accountId")} />}
      {tab === "parties" && <PartiesTab />}
      {tab === "tb" && <TrialBalanceTab range={range} rangeBar={rangeBar} />}
      {tab === "pl" && <PnlTab range={range} rangeBar={rangeBar} />}
      {tab === "bs" && <BalanceSheetTab />}
      {tab === "tally" && <TallyTab range={range} rangeBar={rangeBar} />}
    </>
  );
}
