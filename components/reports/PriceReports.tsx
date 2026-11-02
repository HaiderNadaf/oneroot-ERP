"use client";

import { ArrowDownUp, IndianRupee, Package, Receipt } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { Card, EmptyRow, ErrorBox, SearchInput, StatCard, Table, Td, Th, cx } from "@/components/ui";
import { date, downloadCsv, inr, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { ReportFrame, ReportLink, TotalRow, periodLabel, type Range } from "./ReportKit";

// The chart library loads on its own, after the report (see PurchaseCharts)
const PriceTrendChart = dynamic(() => import("./PurchaseCharts").then((m) => m.PriceTrendChart), {
  ssr: false,
  loading: () => <div className="h-full min-h-40 animate-pulse rounded-lg bg-slate-50" />,
});

interface PriceRow {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  value: number;
  count: number;
  avgPrice: number;
  minRate: number;
  maxRate: number;
}

interface PriceTrend {
  quantity: number;
  value: number;
  avgPrice: number;
  points: { day: string; quantity: number; value: number; count: number; rate: number; avgPrice: number }[];
  entries: { id: string; at: string; refType: string | null; refId: string | null; refNo: string | null; quantity: number; unitCost: number }[];
}

const NOTE =
  "Cost per unit excl. GST, after discount, of every purchase and goods inward in the period (free units lower it). Weighted average = total cost ÷ total quantity.";

/** "02 Nov" on the chart axis; the year too when the period crosses one */
function dayLabel(day: string, withYear: boolean) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(withYear ? { year: "2-digit" } : {}) });
}

/** Products bought in the period on the left; the selected one's weighted average purchase price on the right */
export function WeightedAvgPriceReport({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<{ products: PriceRow[] }>("/reports/weighted-avg-price", { ...range });
  const products = useMemo(() => data?.products ?? [], [data]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s)) : products;
  }, [products, search]);
  // The first product until one is picked (or when the picked one isn't bought in a newly chosen period)
  const selected = products.find((p) => p.id === selectedId) ?? products[0] ?? null;

  function csv() {
    downloadCsv(
      `weighted-avg-price-${range.from}-to-${range.to}.csv`,
      ["Product", "Unit", "Quantity Bought", "Total Cost (Excl. GST)", "Entries", "Weighted Avg. Price", "Lowest Rate", "Highest Rate"],
      products.map((p) => [p.name, p.unit, p.quantity, p.value, p.count, p.avgPrice, p.minRate, p.maxRate]),
    );
  }

  return (
    <ReportFrame
      title="Weighted Average Purchase Price"
      period={periodLabel(range)}
      controls={rangeBar}
      onCsv={csv}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <>
          <p className="mb-3 text-xs text-slate-500">{NOTE}</p>
          {!products.length ? (
            <Card>
              <p className="py-10 text-center text-sm text-slate-400">No purchases in this period</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] print:block">
              <Card bodyClassName="p-0" className="no-print self-start">
                <div className="border-b border-slate-200 p-2">
                  <SearchInput value={search} onChange={setSearch} placeholder={`Search ${products.length} products…`} />
                </div>
                <ul className="max-h-72 overflow-y-auto lg:max-h-[38rem]">
                  {!shown.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No product matches</li>}
                  {shown.map((p) => {
                    const active = p.id === selected?.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          aria-current={active || undefined}
                          className={cx(
                            "flex w-full items-center justify-between gap-3 border-l-2 px-3 py-2 text-left transition-colors",
                            active ? "border-brand-600 bg-brand-50" : "border-transparent hover:bg-slate-50",
                          )}
                        >
                          <span className="min-w-0">
                            <span className={cx("block truncate text-sm font-medium", active ? "text-brand-700" : "text-slate-900")}>{p.name}</span>
                            <span className="num block text-xs text-slate-500">
                              {qty(p.quantity)} {p.unit} · {p.count} {p.count === 1 ? "entry" : "entries"}
                            </span>
                          </span>
                          <span className="num shrink-0 text-sm font-semibold text-slate-900">{inr(p.avgPrice)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {selected && <ProductPrice key={selected.id} product={selected} range={range} />}
            </div>
          )}
        </>
      )}
    </ReportFrame>
  );
}

function ProductPrice({ product: p, range }: { product: PriceRow; range: Range }) {
  const { data, error, loading, reload } = useApi<PriceTrend>(`/reports/weighted-avg-price/${p.id}`, { ...range });
  const withYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const points = useMemo(
    () => (data?.points ?? []).map((d) => ({ ...d, label: dayLabel(d.day, withYear) })),
    [data, withYear],
  );

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <ReportLink href={`/products/${p.id}`} perms={["products.view"]} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
          {p.name}
        </ReportLink>
        <span className="text-xs text-slate-500">per {p.unit}, excl. GST</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Weighted Avg. Price" value={inr(p.avgPrice)} sub={`per ${p.unit}`} icon={<IndianRupee />} tone="green" />
        <StatCard label="Quantity Bought" value={`${qty(p.quantity)} ${p.unit}`} sub={`${p.count} ${p.count === 1 ? "entry" : "entries"}`} icon={<Package />} />
        <StatCard label="Total Cost" value={inr(p.value)} sub="Excl. GST" icon={<Receipt />} tone="amber" />
        <StatCard label="Rate Range" value={p.minRate === p.maxRate ? inr(p.minRate) : `${inr(p.minRate)} – ${inr(p.maxRate)}`} sub="Lowest – highest" icon={<ArrowDownUp />} />
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <>
          <Card title="Weighted Average Price Over Time" className="mb-4">
            <div className="h-80">
              {loading && !data ? <div className="h-full animate-pulse rounded-lg bg-slate-50" /> : <PriceTrendChart data={points} unit={p.unit} />}
            </div>
          </Card>

          <Card title="Purchases" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Document</Th>
                  <Th right>Quantity</Th>
                  <Th right>Rate</Th>
                  <Th right>Cost</Th>
                </tr>
              </thead>
              <tbody>
                {!data?.entries.length ? (
                  <EmptyRow colSpan={5}>{loading ? "Loading…" : "No purchases in this period"}</EmptyRow>
                ) : (
                  data.entries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap">{date(e.at)}</Td>
                      <Td>
                        {e.refType === "GRN" && e.refId ? (
                          <ReportLink href={`/goods-inward/${e.refId}`} perms={["grn.view", "purchases.receive"]} className="font-medium text-brand-700 hover:underline">
                            {e.refNo ?? "GRN"}
                          </ReportLink>
                        ) : e.refType === "PURCHASE" && e.refId ? (
                          <ReportLink href={`/purchases/${e.refId}`} perms={["purchases.view"]} className="font-medium text-brand-700 hover:underline">
                            {e.refNo ?? "Purchase"}
                          </ReportLink>
                        ) : (
                          (e.refNo ?? "—")
                        )}
                      </Td>
                      <Td right className="num">
                        {qty(e.quantity)} {p.unit}
                      </Td>
                      <Td right className="num">
                        {inr(e.unitCost)}
                      </Td>
                      <Td right className="num">
                        {inr(e.quantity * e.unitCost)}
                      </Td>
                    </tr>
                  ))
                )}
                {!!data?.entries.length && (
                  // Step by step: total cost ÷ total units = the weighted average price
                  <TotalRow>
                    <Td colSpan={2}>Total cost ÷ total units</Td>
                    <Td right className="num">
                      {qty(data.quantity)} {p.unit}
                    </Td>
                    <Td right className="num">
                      {inr(data.avgPrice)}
                    </Td>
                    <Td right className="num">
                      {inr(data.value)}
                    </Td>
                  </TotalRow>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
