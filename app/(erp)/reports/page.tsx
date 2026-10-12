"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { GstReportView, ProfitLossReport } from "@/components/reports/FinancialReports";
import { DayBookReport, OutstandingReport, StockValuationReport } from "@/components/reports/LedgerReports";
import { ProductSalesReport, PurchaseRegisterReport, SalesRegisterReport } from "@/components/reports/RegisterReports";
import { RangeBar, defaultRange, type Range } from "@/components/reports/ReportKit";
import { PageHeader, Tabs } from "@/components/ui";

const TABS = [
  { value: "pl", label: "Profit & Loss" },
  { value: "gst", label: "GST summary" },
  { value: "sales", label: "Sales register" },
  { value: "purchases", label: "Purchase register" },
  { value: "products", label: "Product-wise sales" },
  { value: "stock", label: "Stock valuation" },
  { value: "outstanding", label: "Outstanding" },
  { value: "daybook", label: "Day book" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export default function ReportsPage() {
  return (
    <RequirePerm perms={["reports.view"]}>
      <Reports />
    </RequirePerm>
  );
}

function Reports() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === fromUrl) ? (fromUrl as Tab) : "pl";
  const [range, setRange] = useState<Range>(defaultRange);

  // Keep the tab in the URL so a report can be bookmarked or reopened after printing
  const setTab = (t: Tab) => router.replace(`/reports?tab=${t}`, { scroll: false });
  const rangeBar = <RangeBar value={range} onChange={setRange} />;

  return (
    <>
      <PageHeader title="Reports" subtitle="Profit, GST, registers, stock and outstanding — print or export any report" />
      <Tabs<Tab> tabs={[...TABS]} value={tab} onChange={setTab} />

      {tab === "pl" && <ProfitLossReport range={range} rangeBar={rangeBar} />}
      {tab === "gst" && <GstReportView range={range} rangeBar={rangeBar} />}
      {tab === "sales" && <SalesRegisterReport range={range} rangeBar={rangeBar} />}
      {tab === "purchases" && <PurchaseRegisterReport range={range} rangeBar={rangeBar} />}
      {tab === "products" && <ProductSalesReport range={range} rangeBar={rangeBar} />}
      {tab === "stock" && <StockValuationReport />}
      {tab === "outstanding" && <OutstandingReport />}
      {tab === "daybook" && <DayBookReport />}
    </>
  );
}
