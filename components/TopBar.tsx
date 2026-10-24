"use client";

import {
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  CornerDownLeft,
  KeyRound,
  Layers,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  ShoppingCart,
  Store,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { useBranch } from "@/lib/branch";
import { date, inr, n, qty } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { NotificationBell } from "./Notifications";
import { ThemeToggle } from "./ThemeToggle";
import { ProductScan } from "./ProductScan";
import { cx, InfinityLoader, TOP_ICON_BUTTON, useConfirm } from "./ui";

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

/**
 * Result kinds, in the order they are listed and offered as filters. `perms` matches what the API checks before
 * searching that kind (DashboardService.search), so the hints only offer what this user will actually get back.
 */
const KINDS = [
  { key: "products", label: "Products", icon: <Package />, perms: ["products.view"], hint: "SKU, barcode, brand" },
  { key: "batches", label: "Batches", icon: <Layers />, perms: ["inventory.view", "products.view"], hint: "batch no" },
  { key: "customers", label: "Customers", icon: <Users />, perms: ["customers.view"], hint: "phone, village" },
  { key: "vendors", label: "Vendors", icon: <Boxes />, perms: ["vendors.view"], hint: "GSTIN" },
  { key: "sales", label: "Sales", icon: <Receipt />, perms: ["sales.view"], hint: "bill number" },
  { key: "purchaseOrders", label: "Purchase Orders", icon: <ClipboardList />, perms: ["purchases.view"], hint: "PO number" },
  // Purchase Invoices removed from search
  // { key: "purchases", label: "Purchase Invoices", icon: <Truck />, perms: ["invoices.view"], hint: "vendor bill number" },
] as const satisfies readonly { key: string; label: string; icon: ReactNode; perms: readonly Permission[]; hint: string }[];
type Kind = (typeof KINDS)[number]["key"];

/** The kinds this user may search (administrators: all) */
function useSearchKinds() {
  const { can } = useAuth();
  return KINDS.filter((k) => can(...k.perms));
}

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

/** `productPage`: may open /products/:id; batches are also searchable with stock access alone, which opens the Batches tab instead */
function toHits(r: SearchResults, term: string, productPage: boolean): Hit[] {
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
      href: productPage ? `/products/${b.product.id}` : "/inventory?tab=batches",
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
    // Purchase Invoices removed from search
    // ...r.purchases.map((p) => ({
    //   key: "i" + p.id,
    //   kind: "purchases" as const,
    //   title: `Purchase ${p.purchaseNo}`,
    //   sub: `${p.vendor.name}${p.vendorInvoiceNo ? ` · bill ${p.vendorInvoiceNo}` : ""} · ${inr(p.totalAmount)} · ${date(p.purchaseDate)}`,
    //   href: `/purchases/${p.id}`,
    // })),
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

const Key = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-slate-200 bg-surface px-1 font-sans">{children}</kbd>;

/** Marks the top-bar button that opens / closes the search, so a click on it isn't taken as an outside click */
const SEARCH_TOGGLE = "data-search-toggle";

/**
 * Search bills, products, batches and parties from anywhere. Shortcut: "/" or Ctrl+K.
 * Hidden behind the search button until opened (`expanded`): inline in the bar on wider screens,
 * a full-width row under it on phones. Esc, an outside click or opening a result folds it away again.
 */
function GlobalSearch({ expanded, onExpand, onCollapse }: { expanded: boolean; onExpand: () => void; onCollapse: () => void }) {
  const router = useRouter();
  const kinds = useSearchKinds();
  const canProductPage = useAuth().can("products.view");
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
        setResults({ for: debounced, hits: toHits(r, debounced, canProductPage) });
        setActive(0);
      })
      .catch(() => !cancelled && setResults({ for: debounced, hits: [] }));
    return () => {
      cancelled = true;
    };
  }, [debounced, canProductPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        onExpand();
        // The box may only now be shown: focus once it is laid out
        requestAnimationFrame(() => input.current?.focus());
        setOpen(true);
      }
    };
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t) || t.closest?.(`[${SEARCH_TOGGLE}]`)) return;
      setOpen(false);
      onCollapse();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", close);
    };
  }, [onExpand, onCollapse]);

  // Opened from the search button: straight into typing
  useEffect(() => {
    if (expanded) input.current?.focus();
  }, [expanded]);

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
    ...kinds.filter((k) => counts.get(k.key)).map((k) => ({ key: k.key, label: k.label, n: counts.get(k.key) ?? 0 })),
  ];

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    setKind("all");
    input.current?.blur();
    onCollapse();
    router.push(h.href);
  }

  function pickKind(k: Kind | "all") {
    setKind(k);
    setActive(0);
  }

  return (
    <div
      ref={box}
      className={cx(
        "relative min-w-0",
        // Only while opened. Phone: its own full-width row under the bar; wider screens: inline, growing with the screen
        // (76% of the old 14 / 18 / 22 / 28rem widths)
        expanded ? "order-last basis-full sm:order-none sm:basis-auto sm:w-[10.64rem] md:w-[13.68rem] lg:w-[16.72rem] xl:w-[21.28rem]" : "hidden",
      )}
    >
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
            onCollapse();
          }
        }}
        placeholder={`Search ${kinds.map((k) => k.label.toLowerCase()).slice(0, 3).join(", ")}…`}
        aria-label="Search"
        className="h-10 w-full rounded-full border border-line bg-surface pl-10 pr-16 text-sm transition-colors placeholder:text-slate-400 hover:border-brand-300 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && <InfinityLoader className="size-5" />}
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
          <kbd className="pointer-events-none hidden rounded-md border border-slate-200 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">Ctrl K</kbd>
        )}
      </span>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl shadow-slate-900/10">
          {debounced.length < 2 ? (
            <div className="px-4 py-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Search Across</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {kinds.map((k) => (
                  <span key={k.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 [&>svg]:size-3.5 [&>svg]:text-brand-600">
                    {k.icon}
                    {k.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                By name, {[...new Set(kinds.map((k) => k.hint))].join(", ")}. Type at least 2 characters.
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
                      <span className={cx("num rounded-full px-1.5 text-[10px]", scope === f.key ? "bg-white/20" : "bg-surface text-slate-500")}>{f.n}</span>
                    </button>
                  ))}
                </div>
              )}
              <div ref={list} className="max-h-[60vh] overflow-y-auto py-1">
                {loading && (
                  <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                    <InfinityLoader className="size-6" /> Searching…
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

/** Open / close state for a top-bar panel: closes on an outside click, Esc or moving to another page */
function usePanel() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [shownOn, setShownOn] = useState(pathname);
  if (open && shownOn !== pathname) setOpen(false);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const toggle = () => {
    setShownOn(pathname);
    setOpen((o) => !o);
  };
  return { open, setOpen, toggle, box };
}

/**
 * A top-bar panel: a bottom sheet with a backdrop on phones, a dropdown under its button from 640px up.
 * Render it inside the `relative` box that holds the button.
 */
function Panel({
  title,
  align,
  className,
  onClose,
  children,
}: {
  title: string;
  align: "left" | "right";
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-night-900/30 sm:hidden" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className={cx(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl",
          "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-[70vh] sm:rounded-xl sm:border sm:border-slate-200 sm:pb-0 sm:shadow-xl",
          align === "right" ? "sm:right-0" : "sm:left-0",
          className,
        )}
      >
        {/* Phone: grab handle and a title row with a close button */}
        <div className="shrink-0 sm:hidden">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between px-4 pb-1 pt-2">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const { current, locked } = useBranch();
  const { open, setOpen, toggle, box } = usePanel();
  const confirm = useConfirm();

  if (!user) return null;
  const roleLabel = user.roleTemplate?.name ?? user.role.charAt(0) + user.role.slice(1).toLowerCase();

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        className={cx(
          "flex items-center gap-2.5 rounded-lg p-0.5 hover:bg-slate-100",
          // Wider screens: a tinted, bordered chip that stands apart from the white bar (matches the search box)
          "md:h-11 md:min-w-56 md:rounded-[10px] md:border md:border-line md:bg-surface md:py-1 md:pl-1 md:pr-2.5 md:hover:border-brand-300 md:hover:bg-brand-50/60",
          open && "bg-slate-100 md:border-brand-500 md:bg-surface md:ring-4 md:ring-brand-500/15",
        )}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 md:bg-brand-600 md:text-white">{initialsOf(user.name)}</span>
        <span className="hidden max-w-40 flex-1 text-left leading-tight md:block">
          <span className="block truncate text-[13px] font-semibold text-slate-800">{user.name}</span>
          <span className="block truncate text-[11.5px] text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown className={cx("hidden size-4 text-slate-400 transition-transform md:block", open && "rotate-180")} />
      </button>
      {open && (
        // Wider screens: exactly as wide as the chip above it (the chip keeps a minimum width so the email still fits)
        <Panel title="Account" align="right" className="sm:w-72 md:left-0 md:w-auto" onClose={() => setOpen(false)}>
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 pb-3 pt-1 sm:pt-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base font-bold text-brand-700 sm:size-10 sm:text-sm">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">{roleLabel}</span>
                {current && (
                  <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">
                    <Store className="size-3 shrink-0" />
                    <span className="truncate">{locked ? current.name : `${current.name}`}</span>
                  </span>
                )}
              </p>
            </div>
          </div>
          {/* Administrators only: staff passwords are reset by an administrator from Users */}
          {isAdmin && (
            <div className="overflow-y-auto py-1">
              {[
                { href: "/account", label: "My Account", icon: <UserRound /> },
                { href: "/account", label: "Change Password", icon: <KeyRound /> },
              ].map((i) => (
                <Link
                  key={i.label}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 sm:py-2 [&>svg]:size-4 [&>svg]:text-slate-400"
                >
                  {i.icon}
                  {i.label}
                </Link>
              ))}
            </div>
          )}
          <button
            onClick={async () => {
              setOpen(false);
              if (await confirm("Sign out of OneRoot ERP? Anything not saved on this page will be lost.", { danger: true, confirmLabel: "Sign Out" })) logout();
            }}
            className="flex w-full shrink-0 items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 sm:py-2.5"
          >
            <LogOut className="size-4" /> Sign Out
          </button>
        </Panel>
      )}
    </div>
  );
}

/**
 * "Branch: Main Branch ▾". Phones show the short branch code; the list opens as a bottom sheet there and as a
 * dropdown on wider screens. Staff locked to a branch just see its name.
 */
function BranchPicker() {
  const { branches, currentId, current, locked, canViewAll, setBranch } = useBranch();
  const { open, setOpen, toggle, box } = usePanel();
  const [q, setQ] = useState("");
  const all = currentId === "all";
  const shell = "flex h-10 min-w-0 items-center gap-2 rounded-[9px] border border-line bg-surface px-2.5";
  const label = <span className="hidden text-[12px] font-medium uppercase tracking-[0.06em] text-muted md:inline">Branch</span>;
  // Phones: the code (MAIN, CHM); wider: the full name
  const name = (
    <>
      <span className="truncate text-sm font-semibold text-slate-800 sm:hidden">{all ? "All" : (current?.code ?? "—")}</span>
      <span className="hidden truncate text-sm font-semibold text-slate-800 sm:inline">{all ? "All branches" : (current?.name ?? "—")}</span>
    </>
  );

  if (locked || branches.length <= 1) {
    return (
      <div className={cx(shell, "max-w-[9rem] sm:max-w-[16rem]")} title={locked ? `You work in ${current?.name ?? "this branch"}` : current?.name}>
        <Store className="size-4 shrink-0 text-brand-600" />
        {label}
        {name}
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const rows = [
    ...(canViewAll ? [{ id: "all", code: "ALL", name: "All branches", city: "Every branch together" }] : []),
    ...branches,
  ].filter((b) => !term || `${b.name} ${b.code} ${b.city ?? ""}`.toLowerCase().includes(term));

  function pick(id: string) {
    if (id !== currentId) setBranch(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        className={cx(shell, "max-w-[9rem] hover:border-brand-300 sm:max-w-[18rem]", open && "border-brand-500 ring-4 ring-brand-500/15")}
        title={all ? "All branches" : current?.name}
        aria-label="Branch"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Store className="size-4 shrink-0 text-brand-600 sm:size-5" />
        {label}
        {name}
        <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {/* From 640px the list is exactly as wide as the branch button above it (phones: bottom sheet) */}
      {open && (
        <Panel title="Switch Branch" align="left" className="sm:w-full" onClose={() => setOpen(false)}>
          {branches.length > 6 && (
            <div className="relative shrink-0 border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a branch…"
                aria-label="Find a branch"
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none sm:h-9"
              />
            </div>
          )}
          <div role="listbox" aria-label="Branches" className="min-h-0 flex-1 overflow-y-auto py-1">
            {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No branch matches “{q}”</p>}
            {rows.map((b) => {
              const selected = b.id === currentId;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(b.id)}
                  className={cx("flex w-full items-center gap-2.5 px-4 py-3 text-left sm:px-3 sm:py-2", selected ? "bg-brand-50" : "hover:bg-slate-50")}
                >
                  <span
                    className={cx(
                      "flex h-6 min-w-[33px] shrink-0 items-center justify-center rounded px-1 text-[8.5px] font-semibold leading-none",
                      selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {b.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate text-sm", selected ? "font-semibold text-brand-800" : "font-medium text-slate-800")}>{b.name}</span>
                    {b.city && <span className="block truncate text-xs text-slate-500">{b.city}</span>}
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-brand-600" />}
                </button>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { can } = useAuth();
  // Nothing this user may search (a custom role with none of those modules): no search at all
  const canSearch = useSearchKinds().length > 0;
  // Search hides behind a button (inline when opened; a second row on phones)
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  return (
    <header className="no-print relative z-30 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border border-line bg-(--background) px-2.5 py-2 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:py-2.5 lg:px-5">
      <button onClick={onMenu} className="shrink-0 rounded-lg p-2 text-slate-600 hover:bg-surface lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <BranchPicker />
      {/* Search sits at the right end, beside POS, notifications and the user menu */}
      <div className="min-w-0 flex-1" />
      {canSearch && (
        <>
          <GlobalSearch expanded={searchOpen} onExpand={openSearch} onCollapse={closeSearch} />
          {/* Opens the search; once open, wider screens show the box in its place and phones keep it as a close button */}
          <button
            type="button"
            {...{ [SEARCH_TOGGLE]: "" }}
            onClick={() => setSearchOpen((o) => !o)}
            className={cx(TOP_ICON_BUTTON, searchOpen && "border-brand-300 bg-brand-50 text-brand-700 sm:hidden")}
            aria-label={searchOpen ? "Close search" : "Search"}
            title={searchOpen ? undefined : "Search (Ctrl K)"}
            aria-expanded={searchOpen}
          >
            {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
        </>
      )}
      {/* Barcode scans anywhere show the product (camera button on phones / tablets) */}
      <ProductScan />
      {can("sales.bill") && (
        <Link
          href="/sales/new"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[9px] bg-brand-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-forest-700 sm:px-3.5"
          aria-label="New sale (POS)"
        >
          <ShoppingCart className="size-4" />
          <span className="hidden sm:inline">POS</span>
        </Link>
      )}
      <NotificationBell />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
