"use client";

import {
  Boxes,
  ChevronDown,
  ClipboardList,
  CornerDownLeft,
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
  X,
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
import { Dropdown, cx } from "./ui";

interface SearchResults {
  products: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: string;
    isActive: boolean;
    barcode: string | null;
    brand: string | null;
    technicalName: string | null;
    hsnCode: string | null;
  }[];
  customers: { id: string; name: string; phone: string | null; village: string | null; balance: string }[];
  vendors: { id: string; name: string; phone: string | null; gstin: string | null; balance: string }[];
  sales: { id: string; invoiceNo: string; customerName: string | null; customerPhone: string | null; totalAmount: string; saleDate: string; status: string }[];
  purchases: { id: string; purchaseNo: string; vendorInvoiceNo: string | null; totalAmount: string; purchaseDate: string; vendor: { name: string } }[];
  purchaseOrders: { id: string; poNo: string; status: string; totalAmount: string; orderDate: string; vendor: { name: string } }[];
  batches: { id: string; batchNo: string; expiryDate: string | null; quantity: string; product: { id: string; name: string; unit: string } }[];
}

/** Result kinds, in the order they are listed and offered as filters */
const KINDS = [
  { key: "products", label: "Products", icon: <Package /> },
  { key: "batches", label: "Batches", icon: <Layers /> },
  { key: "customers", label: "Customers", icon: <Users /> },
  { key: "vendors", label: "Vendors", icon: <Boxes /> },
  { key: "sales", label: "Sales", icon: <Receipt /> },
  { key: "purchaseOrders", label: "Purchase orders", icon: <ClipboardList /> },
  { key: "purchases", label: "Purchase invoices", icon: <Truck /> },
] as const;
type Kind = (typeof KINDS)[number]["key"];

interface Hit {
  key: string;
  kind: Kind;
  title: string;
  sub: string;
  /** The field that matched when it isn't already shown, e.g. "Barcode: 8901…" */
  matched?: string;
  href: string;
}

/** First labelled field holding the term, for the "Matched …" line */
function matchedOn(term: string, fields: [string, string | null | undefined][]) {
  const t = term.toLowerCase();
  const hit = fields.find(([, v]) => v?.toLowerCase().includes(t));
  return hit ? `${hit[0]}: ${hit[1]}` : undefined;
}

const statusText = (s: string) => s.toLowerCase().replace(/_/g, " ");

function toHits(r: SearchResults, term: string): Hit[] {
  return [
    ...r.products.map((p) => ({
      key: "p" + p.id,
      kind: "products" as const,
      title: p.name,
      sub: `SKU ${p.sku} · ${qty(p.stock)} ${p.unit} in stock${p.isActive ? "" : " · inactive"}`,
      matched: matchedOn(term, [["Barcode", p.barcode], ["Brand", p.brand], ["Technical name", p.technicalName], ["HSN", p.hsnCode]]),
      href: `/products/${p.id}`,
    })),
    ...r.batches.map((b) => ({
      key: "b" + b.id,
      kind: "batches" as const,
      title: `Batch ${b.batchNo}`,
      sub: `${b.product.name} · ${qty(b.quantity)} ${b.product.unit}${b.expiryDate ? ` · expires ${date(b.expiryDate)}` : ""}`,
      href: `/products/${b.product.id}`,
    })),
    ...r.customers.map((c) => ({
      key: "c" + c.id,
      kind: "customers" as const,
      title: c.name,
      sub: [c.phone, c.village, n(c.balance) > 0 ? `due ${inr(c.balance)}` : "no dues"].filter(Boolean).join(" · "),
      href: `/customers/${c.id}`,
    })),
    ...r.vendors.map((v) => ({
      key: "v" + v.id,
      kind: "vendors" as const,
      title: v.name,
      sub: [v.phone, n(v.balance) > 0 ? `payable ${inr(v.balance)}` : "nothing payable"].filter(Boolean).join(" · "),
      matched: matchedOn(term, [["GSTIN", v.gstin]]),
      href: `/vendors/${v.id}`,
    })),
    ...r.sales.map((s) => ({
      key: "s" + s.id,
      kind: "sales" as const,
      title: `Invoice ${s.invoiceNo}`,
      sub: `${s.customerName || "Walk-in"} · ${inr(s.totalAmount)} · ${date(s.saleDate)}${s.status === "CANCELLED" ? " · cancelled" : ""}`,
      matched: matchedOn(term, [["Phone", s.customerPhone]]),
      href: `/sales/${s.id}`,
    })),
    ...r.purchaseOrders.map((p) => ({
      key: "o" + p.id,
      kind: "purchaseOrders" as const,
      title: `PO ${p.poNo}`,
      sub: `${p.vendor.name} · ${inr(p.totalAmount)} · ${date(p.orderDate)} · ${statusText(p.status)}`,
      href: `/purchase-orders/${p.id}`,
    })),
    ...r.purchases.map((p) => ({
      key: "i" + p.id,
      kind: "purchases" as const,
      title: `Purchase ${p.purchaseNo}`,
      sub: `${p.vendor.name}${p.vendorInvoiceNo ? ` · bill ${p.vendorInvoiceNo}` : ""} · ${inr(p.totalAmount)} · ${date(p.purchaseDate)}`,
      href: `/purchases/${p.id}`,
    })),
  ];
}

/** Marks every occurrence of the search term */
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-amber-100 px-0.5 font-semibold text-slate-900">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const Key = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-slate-200 bg-white px-1 font-sans">{children}</kbd>;

/** Search bills, products, batches and parties from anywhere. Shortcut: "/" or Ctrl+K */
function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [results, setResults] = useState<{ for: string; hits: Hit[] } | null>(null);
  const debounced = useDebounced(q.trim(), 200);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.length < 2) return;
    let cancelled = false;
    api
      .get<SearchResults>("/search", { q: debounced })
      .then((r) => {
        if (cancelled) return;
        setResults({ for: debounced, hits: toHits(r, debounced) });
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

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const ready = debounced.length >= 2 && results?.for === debounced;
  const all = ready ? results.hits : [];
  const counts = new Map<Kind, number>();
  for (const h of all) counts.set(h.kind, (counts.get(h.kind) ?? 0) + 1);
  // A filter with nothing left in a new search falls back to everything
  const scope = kind !== "all" && counts.get(kind) ? kind : "all";
  const hits = scope === "all" ? all : all.filter((h) => h.kind === scope);
  const loading = debounced.length >= 2 && !ready;
  const filters = [
    { key: "all" as const, label: "All", n: all.length },
    ...KINDS.filter((k) => counts.get(k.key)).map((k) => ({ key: k.key, label: k.label, n: counts.get(k.key) ?? 0 })),
  ];

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    setKind("all");
    input.current?.blur();
    router.push(h.href);
  }

  function pickKind(k: Kind | "all") {
    setKind(k);
    setActive(0);
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:w-[24rem] sm:flex-none lg:w-[28rem]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
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
        placeholder="Search products, bills, parties…"
        aria-label="Search"
        className="h-10 w-full rounded-full border border-[#e1e6d8] bg-[#f7f9f3] pl-10 pr-16 text-sm transition-colors placeholder:text-slate-400 hover:border-brand-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              input.current?.focus();
            }}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">Ctrl K</kbd>
        )}
      </span>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
          {debounced.length < 2 ? (
            <div className="px-4 py-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Search across</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <span key={k.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 [&>svg]:size-3.5 [&>svg]:text-brand-600">
                    {k.icon}
                    {k.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                By name, SKU, barcode, brand, batch no, phone, village, GSTIN or bill / PO number. Type at least 2 characters.
              </p>
            </div>
          ) : (
            <>
              {/* Filter by kind, with how many matches each has */}
              {ready && all.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
                  {filters.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickKind(f.key)}
                      className={cx(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        scope === f.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                      )}
                    >
                      {f.label}
                      <span className={cx("num rounded-full px-1.5 text-[10px]", scope === f.key ? "bg-white/20" : "bg-white text-slate-500")}>{f.n}</span>
                    </button>
                  ))}
                </div>
              )}
              <div ref={list} className="max-h-[60vh] overflow-y-auto py-1">
                {loading && (
                  <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                    <Loader2 className="size-4 animate-spin" /> Searching…
                  </p>
                )}
                {ready && all.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Search className="mx-auto size-6 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No matches for “{debounced}”</p>
                    <p className="mt-0.5 text-xs text-slate-400">Try a name, SKU, barcode, phone or bill number</p>
                  </div>
                )}
                {hits.map((h, i) => {
                  const k = KINDS.find((x) => x.key === h.kind)!;
                  return (
                    <div key={h.key}>
                      {scope === "all" && (i === 0 || hits[i - 1].kind !== h.kind) && (
                        <p className="px-4 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                      )}
                      <button
                        type="button"
                        data-index={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={cx("flex w-full items-center gap-3 px-3 py-2 text-left", i === active ? "bg-brand-50" : "hover:bg-slate-50")}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100 [&>svg]:size-4">
                          {k.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            <Highlight text={h.title} term={debounced} />
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            <Highlight text={h.sub} term={debounced} />
                          </span>
                          {h.matched && (
                            <span className="mt-0.5 block truncate text-[11px] text-amber-700">
                              Matched <Highlight text={h.matched} term={debounced} />
                            </span>
                          )}
                        </span>
                        {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-slate-400" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="hidden items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-400 sm:flex">
            <span>
              <Key>↑</Key> <Key>↓</Key> move
            </span>
            <span>
              <Key>Enter</Key> open
            </span>
            <span>
              <Key>Esc</Key> close
            </span>
          </div>
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
          <span className={cx("block text-[11.5px] text-slate-500", !user.roleTemplate && "capitalize")}>{user.roleTemplate?.name ?? user.role.toLowerCase()}</span>
        </span>
        <ChevronDown className="hidden size-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
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
  const box = useRef<HTMLDivElement>(null);
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
    <div ref={box} className={cx(shell, "focus-within:border-brand-500")}>
      <Store className="size-4 text-brand-600" />
      {label}
      <Dropdown
        bare
        anchor={box}
        options={[
          ...(canViewAll ? [{ value: "all", label: "All branches" }] : []),
          ...branches.map((b) => ({ value: b.id, label: b.name })),
        ]}
        value={currentId}
        onChange={setBranch}
        isSearch={branches.length > 10}
        className="w-auto max-w-44 font-semibold text-slate-800"
        aria-label="Branch"
      />
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="no-print sticky top-0 z-30 flex items-center gap-2.5 border-b border-[#e1e6d8] bg-white px-4 py-2.5 lg:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <BranchPicker />
      {/* Search sits at the right end, beside POS, notifications and the user menu */}
      <div className="hidden flex-1 sm:block" />
      <GlobalSearch />
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
