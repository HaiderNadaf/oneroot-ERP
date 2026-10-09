"use client";

import {
  Boxes,
  ChevronDown,
  ClipboardList,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, inr, n, qty } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { NotificationBell } from "./Notifications";
import { cx } from "./ui";

interface SearchResults {
  products: { id: string; name: string; sku: string; unit: string; stock: string; isActive: boolean }[];
  customers: { id: string; name: string; phone: string | null; village: string | null; balance: string }[];
  vendors: { id: string; name: string; phone: string | null; balance: string }[];
  sales: { id: string; invoiceNo: string; customerName: string | null; totalAmount: string; saleDate: string; status: string }[];
  purchases: { id: string; purchaseNo: string; vendorInvoiceNo: string | null; totalAmount: string; vendor: { name: string } }[];
  purchaseOrders: { id: string; poNo: string; status: string; totalAmount: string; vendor: { name: string } }[];
  batches: { id: string; batchNo: string; expiryDate: string | null; quantity: string; product: { id: string; name: string; unit: string } }[];
}

interface Hit {
  key: string;
  group: string;
  icon: ReactNode;
  title: string;
  sub: string;
  href: string;
}

function toHits(r: SearchResults): Hit[] {
  return [
    ...r.products.map((p) => ({
      key: "p" + p.id,
      group: "Products",
      icon: <Package />,
      title: p.name,
      sub: `${p.sku} · ${qty(p.stock)} ${p.unit} in stock${p.isActive ? "" : " · inactive"}`,
      href: `/products/${p.id}`,
    })),
    ...r.batches.map((b) => ({
      key: "b" + b.id,
      group: "Batches",
      icon: <Layers />,
      title: `Batch ${b.batchNo}`,
      sub: `${b.product.name} · ${qty(b.quantity)} ${b.product.unit}${b.expiryDate ? ` · exp ${date(b.expiryDate)}` : ""}`,
      href: `/products/${b.product.id}`,
    })),
    ...r.customers.map((c) => ({
      key: "c" + c.id,
      group: "Customers",
      icon: <Users />,
      title: c.name,
      sub: [c.phone, c.village, n(c.balance) > 0 ? `due ${inr(c.balance)}` : null].filter(Boolean).join(" · ") || "Customer",
      href: `/customers/${c.id}`,
    })),
    ...r.vendors.map((v) => ({
      key: "v" + v.id,
      group: "Vendors",
      icon: <Boxes />,
      title: v.name,
      sub: [v.phone, n(v.balance) > 0 ? `payable ${inr(v.balance)}` : null].filter(Boolean).join(" · ") || "Vendor",
      href: `/vendors/${v.id}`,
    })),
    ...r.sales.map((s) => ({
      key: "s" + s.id,
      group: "Sales invoices",
      icon: <Receipt />,
      title: s.invoiceNo,
      sub: `${s.customerName || "Walk-in"} · ${inr(s.totalAmount)} · ${date(s.saleDate)}${s.status === "CANCELLED" ? " · cancelled" : ""}`,
      href: `/sales/${s.id}`,
    })),
    ...r.purchaseOrders.map((p) => ({
      key: "o" + p.id,
      group: "Purchase orders",
      icon: <ClipboardList />,
      title: p.poNo,
      sub: `${p.vendor.name} · ${inr(p.totalAmount)} · ${p.status.toLowerCase().replace(/_/g, " ")}`,
      href: `/purchase-orders/${p.id}`,
    })),
    ...r.purchases.map((p) => ({
      key: "i" + p.id,
      group: "Purchase invoices",
      icon: <Truck />,
      title: p.purchaseNo,
      sub: `${p.vendor.name}${p.vendorInvoiceNo ? ` · bill ${p.vendorInvoiceNo}` : ""} · ${inr(p.totalAmount)}`,
      href: `/purchases/${p.id}`,
    })),
  ];
}

/** Search bills, products, batches and parties from anywhere. Shortcut: "/" or Ctrl+K */
function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<{ for: string; hits: Hit[] } | null>(null);
  const debounced = useDebounced(q.trim(), 200);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.length < 2) return;
    let cancelled = false;
    api
      .get<SearchResults>("/search", { q: debounced })
      .then((r) => {
        if (cancelled) return;
        setResults({ for: debounced, hits: toHits(r) });
        setActive(0);
      })
      .catch(() => !cancelled && setResults({ for: debounced, hits: [] }));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  const ready = debounced.length >= 2 && results?.for === debounced;
  const hits = ready ? results.hits : [];
  const loading = debounced.length >= 2 && !ready;

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(h.href);
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            go(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            input.current?.blur();
          }
        }}
        placeholder="Search bills, products, batches, parties…"
        aria-label="Search"
        className="h-10 w-full rounded-[9px] border border-[#e1e6d8] bg-[#f7f9f3] pl-9 pr-12 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      {loading ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" />
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400 sm:block">
          Ctrl K
        </kbd>
      )}
      {open && debounced.length >= 2 && (ready || loading) && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl sm:min-w-[28rem]">
          {ready && hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No matches for “{debounced}”</p>}
          {hits.map((h, i) => (
            <div key={h.key}>
              {(i === 0 || hits[i - 1].group !== h.group) && (
                <p className="px-4 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{h.group}</p>
              )}
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={cx(
                  "flex w-full items-center gap-3 px-4 py-2 text-left [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-brand-600",
                  i === active ? "bg-brand-50" : "hover:bg-slate-50",
                )}
              >
                {h.icon}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{h.title}</span>
                  <span className="block truncate text-xs text-slate-500">{h.sub}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100"
        aria-label="Account menu"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-semibold text-slate-800">{user.name}</span>
          <span className="block text-[11.5px] capitalize text-slate-500">{user.role.toLowerCase()}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          {[
            { href: "/account", label: "My account", icon: <UserRound /> },
            { href: "/account", label: "Change password", icon: <KeyRound /> },
          ].map((i) => (
            <Link
              key={i.label}
              href={i.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 [&>svg]:size-4 [&>svg]:text-slate-400"
            >
              {i.icon}
              {i.label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** "Branch: Main Branch ▾" — staff locked to a branch just see its name */
function BranchPicker() {
  const { branches, currentId, current, locked, canViewAll, setBranch } = useBranch();
  const shell = "flex h-10 shrink-0 items-center gap-2 rounded-[9px] border border-[#e1e6d8] bg-white px-2.5";
  const label = <span className="hidden text-[11px] font-medium uppercase tracking-[0.06em] text-[#5f6e60] md:inline">Branch</span>;
  if (locked || branches.length <= 1) {
    return (
      <div className={shell} title={locked ? "You work in this branch" : undefined}>
        <Store className="size-4 text-brand-600" />
        {label}
        <span className="max-w-36 truncate text-sm font-semibold text-slate-800">{current?.name ?? "—"}</span>
      </div>
    );
  }
  return (
    <label className={cx(shell, "cursor-pointer focus-within:border-brand-500")}>
      <Store className="size-4 text-brand-600" />
      {label}
      <select
        value={currentId}
        onChange={(e) => setBranch(e.target.value)}
        className="max-w-40 cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none"
        aria-label="Branch"
      >
        {canViewAll && <option value="all">All branches</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-[#e1e6d8] bg-white px-4 py-2.5 lg:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <BranchPicker />
      <GlobalSearch />
      <div className="hidden flex-1 sm:block" />
      <Link
        href="/sales/new"
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[9px] bg-brand-600 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
      >
        <ShoppingCart className="size-4" />
        <span className="hidden sm:inline">POS</span>
      </Link>
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
