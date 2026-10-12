"use client";

import { Landmark } from "lucide-react";
import Link from "next/link";
import { date, inr, inr0 } from "@/lib/format";
import type { CashReconciliation } from "@/lib/types";
import { cx } from "./ui";

/** Dashboard card: counter cash vs what reached the bank, with unexplained gaps in red */
export function CashReconciliationCard({ cash }: { cash: CashReconciliation }) {
  const bad = cash.unexplained > 0;
  return (
    <section className={cx("rounded-xl border bg-white p-4 shadow-sm", bad ? "border-red-300" : "border-[#e1e6d8]")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[#5f6e60]">Cash reconciliation</h3>
          <p className="text-xs text-[#5f6e60]">Closed shifts, last {cash.days} days</p>
        </div>
        <Link href="/shifts" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          <Landmark className="size-3.5" /> Shifts & deposits
        </Link>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-[#5f6e60]">Cash to bank</dt>
          <dd className="num font-medium">{inr(cash.toDeposit)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[#5f6e60]">Deposited in bank</dt>
          <dd className="num font-medium">{inr(cash.deposited)}</dd>
        </div>
        <div className="flex justify-between border-t border-[#eef1e8] pt-1.5">
          <dt className="font-medium text-[#1d2a1f]">Difference</dt>
          <dd className={cx("num font-semibold", cash.gap > 0 ? "text-red-600" : "text-brand-700")}>{cash.gap > 0 ? `− ${inr(cash.gap)}` : inr(0)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {bad ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
            {cash.unexplained} gap{cash.unexplained > 1 ? "s" : ""} not explained
          </span>
        ) : (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">All cash accounted for</span>
        )}
        {cash.openShifts > 0 && <span className="text-xs text-[#5f6e60]">{cash.openShifts} shift{cash.openShifts > 1 ? "s" : ""} open now</span>}
      </div>
      {cash.rows.length > 0 && (
        <ul className="mt-3 divide-y divide-[#eef1e8] text-xs">
          {cash.rows.slice(0, 4).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-[#1d2a1f]">
                {r.cashier} · {r.closedAt ? date(r.closedAt) : "—"}
                {r.counterDifference !== 0 && <span className="ml-1 text-amber-700">(drawer {r.counterDifference > 0 ? "+" : ""}{inr0(r.counterDifference)})</span>}
              </span>
              <span className={cx("num shrink-0 font-medium", r.unexplained ? "text-red-600" : r.gap > 0 ? "text-amber-700" : "text-brand-700")}>
                {r.gap > 0 ? `${inr0(r.gap)} pending` : "banked"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
