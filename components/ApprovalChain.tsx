"use client";

import { Check, ChevronRight, Clock, X } from "lucide-react";
import { Fragment } from "react";
import type { ChainStep } from "@/lib/types";
import { cx } from "./ui";

const STATE_STYLE: Record<ChainStep["state"], { chip: string; icon: React.ReactNode; label: string }> = {
  done: { chip: "bg-brand-50 text-brand-700 ring-brand-600/20", icon: <Check className="size-3" />, label: "approved" },
  current: { chip: "bg-amber-50 text-amber-800 ring-amber-600/30", icon: <Clock className="size-3" />, label: "waiting" },
  rejected: { chip: "bg-red-50 text-red-700 ring-red-600/20", icon: <X className="size-3" />, label: "rejected" },
  pending: { chip: "bg-slate-100 text-slate-500 ring-slate-500/10", icon: null, label: "not yet" },
};

/** Compact "Store Manager › Owner" chips showing where a PO is in its approval chain */
export function ApprovalChain({ chain, showNames, className }: { chain: ChainStep[]; showNames?: boolean; className?: string }) {
  if (!chain.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className={cx("flex flex-wrap items-center gap-1", className)}>
      {chain.map((s, i) => {
        const st = STATE_STYLE[s.state] ?? STATE_STYLE.pending;
        return (
          <Fragment key={s.order}>
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-slate-300" aria-hidden />}
            <span
              title={`${s.title}: ${s.approverName ?? "any manager"} (${st.label})`}
              className={cx(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                st.chip,
              )}
            >
              {st.icon}
              {s.title}
              {showNames && <span className="font-normal opacity-75">· {s.approverName ?? "any manager"}</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
