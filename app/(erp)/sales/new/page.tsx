"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  ScanLine,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { CustomerForm } from "@/components/CustomerForm";
import { CustomerPicker } from "@/components/pickers";
import { Button, Checkbox, Input, Modal, Select, Spinner, Textarea, cx, errMsg, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, daysUntil, inr, inr0, n, qty, round2 } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { Batch, Category, Customer, Paged, PaymentMode, Product, Sale, StoreSettings } from "@/lib/types";

/** Product list row with the POS extras from `withExpiry=true` */
type PosProduct = Product & { sellable?: number; nextExpiry?: string | null };

interface Line {
  key: number;
  product: PosProduct;
  /** Sellable (non-expired, qty > 0) batches of this branch; null while loading */
  batches: Batch[] | null;
  batchId: string;
  quantity: string;
  rate: string;
  discountPct: string;
}

const MODES: { mode: PaymentMode; label: string }[] = [
  { mode: "CASH", label: "Cash" },
  { mode: "UPI", label: "UPI" },
  { mode: "CARD", label: "Card" },
  { mode: "CREDIT", label: "Credit" },
  { mode: "BANK", label: "Bank" },
  { mode: "CHEQUE", label: "Cheque" },
];

const isExpired = (b: Batch) => !!b.expiryDate && (daysUntil(b.expiryDate) ?? 0) < 0;
const lineGross = (l: Line) => n(l.quantity) * n(l.rate) * (1 - Math.min(100, n(l.discountPct)) / 100);
/** Sellable stock in this branch for a product card */
const sellableOf = (p: PosProduct) => (p.sellable !== undefined ? p.sellable : n(p.stock));

export default function PosPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useAuth();
  const { current } = useBranch();
  const needBranch = useNeedBranch("bill from it");
  const searchRef = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLElement>(null);
  const keySeq = useRef(0);

  // Catalogue for the grid: every active product with this branch's sellable stock and next expiry
  const catalogue = useApi<Paged<PosProduct>>(needBranch.blocked ? null : "/products", {
    status: "active",
    withExpiry: "true",
    pageSize: 500,
  });
  const { data: categories } = useApi<Category[]>("/categories");
  const { data: store } = useApi<StoreSettings>("/settings");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState("");
  const [walkinName, setWalkinName] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [billDiscount, setBillDiscount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [received, setReceived] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [interState, setInterState] = useState(false);
  const [notes, setNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [overLimit, setOverLimit] = useState<string | null>(null);
  const [done, setDone] = useState<Sale | null>(null);

  const alertDays = store?.expiryAlertDays ?? 60;
  const products = useMemo(() => catalogue.data?.items ?? [], [catalogue.data]);

  // Preselect a customer from ?customerId=
  const presetId = params.get("customerId");
  useEffect(() => {
    if (!presetId) return;
    api
      .get<Customer>(`/customers/${presetId}`)
      .then((c) => {
        setCustomer(c);
        setPhone(c.phone ?? "");
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [presetId, toast]);

  const pickCustomer = useCallback(
    (c: Customer | null) => {
      setCustomer(c);
      setInterState(c ? placeOfSupply(c, store).interState === true : false);
      setReceived(null);
      if (c?.phone) setPhone(c.phone);
      if (!c && mode === "CREDIT") setMode("CASH");
    },
    [store, mode],
  );

  // Typing a 10-digit mobile number looks the farmer up
  async function changePhone(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    if (customer && customer.phone !== digits) pickCustomer(null);
    if (digits.length !== 10) return;
    try {
      const r = await api.get<Paged<Customer>>("/customers", { search: digits, pageSize: 5 });
      const match = r.items.find((c) => c.phone === digits);
      if (match) {
        pickCustomer(match);
        toast.success(`Customer found: ${match.name}`);
      }
    } catch {
      /* lookup is a convenience; billing still works as walk-in */
    }
  }

  // ── Grid filtering ──
  const usedCategories = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return (categories ?? []).filter((c) => ids.has(c.id));
  }, [products, categories]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.categoryId === category) &&
        (!q ||
          [p.name, p.sku, p.brand, p.barcode, p.technicalName, p.packSize]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q))),
    );
  }, [products, search, category]);

  const inCart = (productId: string) => lines.filter((l) => l.product.id === productId).reduce((s, l) => s + n(l.quantity), 0);

  // ── Cart ──
  function addProduct(p: PosProduct) {
    if (needBranch.blocked) return toast.error("Pick a branch in the top bar to bill from");
    const left = sellableOf(p) - inCart(p.id);
    if (left < 1) {
      toast.error(sellableOf(p) > 0 ? `No more sellable stock of ${p.name}` : `${p.name} is out of stock here`);
      return;
    }
    const existing = lines.find((l) => l.product.id === p.id && !l.batchId);
    if (existing) {
      setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, quantity: String(round2(n(l.quantity) + 1)) } : l)));
      return;
    }
    const key = ++keySeq.current;
    setLines((ls) => [...ls, { key, product: p, batches: null, batchId: "", quantity: "1", rate: String(n(p.salePrice)), discountPct: "" }]);
    // Batches for this branch, for the optional batch choice
    api
      .get<Product>(`/products/${p.id}`)
      .then((full) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, batches: full.batches ?? [] } : l))))
      .catch(() => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, batches: [] } : l))));
  }

  function step(key: number, delta: number) {
    setLines((ls) =>
      ls.flatMap((l) => {
        if (l.key !== key) return [l];
        const next = round2(n(l.quantity) + delta);
        if (next <= 0) return [];
        if (delta > 0 && inCart(l.product.id) + delta > sellableOf(l.product)) {
          toast.error(`No more sellable stock of ${l.product.name}`);
          return [l];
        }
        return [{ ...l, quantity: String(next) }];
      }),
    );
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    // Barcode scanners type the code and press Enter
    const exact = products.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
    const pick = exact ?? (visible.length === 1 ? visible[0] : null);
    if (pick) {
      addProduct(pick);
      setSearch("");
    }
  }

  // ── Bill math (mirrors the server: GST-inclusive rates, bill discount spread pro-rata) ──
  const summary = useMemo(() => {
    const itemsTotal = lines.reduce((s, l) => s + lineGross(l), 0);
    const discount = Math.min(n(billDiscount), itemsTotal);
    const factor = itemsTotal > 0 ? 1 - discount / itemsTotal : 1;
    let tax = 0;
    for (const l of lines) {
      const amt = lineGross(l) * factor;
      tax += amt - amt / (1 + n(l.product.gstRate) / 100);
    }
    const net = itemsTotal - discount;
    const total = Math.round(net);
    return {
      itemsTotal: round2(itemsTotal),
      discount: round2(discount),
      tax: round2(tax),
      taxable: round2(net - tax),
      roundOff: round2(total - net),
      total,
      count: lines.reduce((s, l) => s + n(l.quantity), 0),
    };
  }, [lines, billDiscount]);

  const defaultReceived = mode === "CREDIT" ? 0 : summary.total;
  const receivedAmt = received === null ? defaultReceived : n(received);
  const change = mode === "CASH" ? round2(receivedAmt - summary.total) : 0;
  const paidAmount = round2(Math.min(receivedAmt, summary.total));
  const due = round2(summary.total - paidAmount);
  const projectedBalance = customer ? round2(n(customer.balance) + due) : 0;
  const overCredit = !!customer && n(customer.creditLimit) > 0 && due > 0 && projectedBalance > n(customer.creditLimit);

  function chooseMode(m: PaymentMode) {
    setMode(m);
    setReceived(null);
    if (m === "CASH" || m === "CREDIT") setReference("");
  }

  function validate(): string | null {
    if (needBranch.blocked) return "Pick a branch in the top bar to bill from";
    if (!lines.length) return "Add at least one product";
    for (const l of lines) {
      if (n(l.quantity) <= 0) return `Enter a quantity for ${l.product.name}`;
      if (n(l.rate) < 0) return `Rate for ${l.product.name} cannot be negative`;
      if (n(l.discountPct) < 0 || n(l.discountPct) > 100) return `Discount for ${l.product.name} must be 0–100%`;
    }
    if (summary.total <= 0) return "Bill total must be more than zero";
    if (!customer && due > 0) return "Credit needs a registered customer — pick or add the farmer first";
    if (phone && phone.length !== 10) return "Enter a valid 10-digit mobile number";
    return null;
  }

  async function submit(allowOverCreditLimit = false) {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const sale = await api.post<Sale>("/sales", {
        customerId: customer?.id,
        customerName: customer ? undefined : walkinName.trim() || undefined,
        customerPhone: customer ? undefined : phone || undefined,
        items: lines.map((l) => ({
          productId: l.product.id,
          batchId: l.batchId || undefined,
          quantity: n(l.quantity),
          rate: n(l.rate),
          discountPct: n(l.discountPct) || undefined,
        })),
        discount: summary.discount || undefined,
        paidAmount,
        paymentMode: mode,
        paymentReference: reference.trim() || undefined,
        isInterState: interState,
        allowOverCreditLimit: allowOverCreditLimit || undefined,
        notes: notes.trim() || undefined,
      });
      setOverLimit(null);
      setDone(sale);
      void catalogue.reload();
    } catch (e) {
      const msg = errMsg(e);
      if (e instanceof ApiError && /credit limit/i.test(msg) && can("MANAGER") && !allowOverCreditLimit) setOverLimit(msg);
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function newSale() {
    setDone(null);
    setLines([]);
    setBillDiscount("");
    setReceived(null);
    setReference("");
    setNotes("");
    setWalkinName("");
    setPhone("");
    setCustomer(null);
    setMode("CASH");
    setInterState(false);
    setEditing(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // Keyboard: F2 → search, Ctrl/⌘+Enter or F9 → complete sale
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const waText = done
    ? encodeURIComponent(
        `Thank you for shopping at ${store?.storeName ?? "our store"}! Bill ${done.invoiceNo} for ${inr(done.totalAmount)}` +
          (n(done.totalAmount) > n(done.paidAmount) ? ` (balance due ${inr(n(done.totalAmount) - n(done.paidAmount))})` : "") +
          ".",
      )
    : "";
  const waPhone = done ? (customer?.phone ?? phone) : "";

  return (
    <div className="pb-20 xl:pb-0">
      {/* Heading */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-[#5f6e60]">
            <Link href="/sales" className="text-brand-700 hover:underline">
              Sales
            </Link>{" "}
            / POS
          </p>
          <h1 className="text-[26px] font-bold tracking-tight text-[#1d2a1f]">POS · {current?.name ?? "All branches"}</h1>
          <p className="text-[13px] text-[#5f6e60]">
            {needBranch.blocked ? "Choose a branch in the top bar to bill from it. " : ""}
            The earliest-expiring batch is picked automatically; expired stock can&apos;t be billed.
            <span className="hidden lg:inline">
              {" "}
              <kbd className="rounded border border-slate-300 bg-white px-1 text-[11px]">F2</kbd> search ·{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1 text-[11px]">F9</kbd> complete sale
            </span>
          </p>
        </div>
        <Link href="/sales">
          <Button variant="secondary" icon={<ReceiptText className="size-4" />}>
            Invoices
          </Button>
        </Link>
      </div>

      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Products ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              autoFocus
              placeholder="Scan barcode or search product"
              aria-label="Scan barcode or search product"
              className="h-11 w-full rounded-[10px] border border-[#e1e6d8] bg-white pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ id: "", name: "All" }, ...usedCategories].map((c) => (
              <button
                key={c.id || "all"}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cx(
                  "shrink-0 rounded-full border px-4 py-1.5 text-[13.5px] font-medium transition-colors",
                  category === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-[#e1e6d8] bg-white text-[#1d2a1f] hover:border-brand-500",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {needBranch.blocked ? null : catalogue.loading && !catalogue.data ? (
            <Spinner />
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d5dccb] bg-white px-4 py-16 text-center text-sm text-slate-500">
              <b className="block text-slate-700">No products found</b>
              Try another name or barcode.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {visible.map((p) => {
                const sellable = sellableOf(p);
                const total = n(p.stock);
                const left = sellable - inCart(p.id);
                const expiresIn = p.nextExpiry ? daysUntil(p.nextExpiry) : null;
                const expiring = expiresIn !== null && expiresIn <= alertDays;
                const blocked = left < 1;
                const count = inCart(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    disabled={sellable <= 0}
                    className={cx(
                      "relative flex min-h-[148px] flex-col rounded-[10px] border bg-white p-3.5 text-left transition-colors",
                      sellable <= 0 ? "cursor-not-allowed border-[#e1e6d8] opacity-55" : "border-[#e1e6d8] hover:border-brand-500 hover:shadow-sm",
                      count > 0 && "border-brand-500 ring-1 ring-brand-500/30",
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#5f6e60]">
                        {p.category?.name ?? p.type.toLowerCase()}
                      </span>
                      {expiring && sellable > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-[#fbe4df] px-2 py-0.5 text-[11px] font-semibold text-[#c2412d]"
                          title={`Earliest batch expires ${date(p.nextExpiry)}`}
                        >
                          Expiring
                        </span>
                      )}
                    </span>
                    <b className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-[#1d2a1f]">{p.name}</b>
                    <span className="text-[13px] text-[#5f6e60]">{p.packSize || p.unit}</span>
                    <span className="num mt-auto pt-2 text-[17px] font-bold text-[#1d2a1f]">{inr(p.salePrice)}</span>
                    <span className={cx("text-[12.5px]", sellable <= 0 || blocked ? "text-[#c2412d]" : "text-[#5f6e60]")}>
                      {sellable <= 0
                        ? total > 0
                          ? "Only expired stock · blocked"
                          : "Out of stock"
                        : `${qty(sellable)} in stock`}
                    </span>
                    {count > 0 && (
                      <span className="num absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow">
                        {qty(count)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Bill ── */}
        <aside
          ref={billRef}
          aria-label="Bill"
          className="flex h-fit flex-col overflow-hidden rounded-xl border border-[#e1e6d8] bg-white shadow-sm xl:sticky xl:top-20"
        >
          <header className="flex items-center justify-between border-b border-[#e1e6d8] px-4 py-3">
            <h2 className="text-base font-bold text-[#1d2a1f]">Bill</h2>
            <span className="text-[13px] text-[#5f6e60]">
              {qty(summary.count)} item{summary.count === 1 ? "" : "s"}
            </span>
          </header>

          {/* Customer */}
          <div className="space-y-2 border-b border-[#e1e6d8] p-4">
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => void changePhone(e.target.value)}
                placeholder="Farmer mobile no."
                aria-label="Farmer mobile number"
                className="h-11"
              />
              {customer ? (
                <div className="flex h-11 items-center justify-between gap-1 rounded-lg border border-brand-300 bg-brand-50 px-2.5">
                  <span className="truncate text-sm font-semibold text-slate-800">{customer.name}</span>
                  <button onClick={() => pickCustomer(null)} className="text-slate-400 hover:text-slate-700" aria-label="Back to walk-in">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <Input
                  value={walkinName}
                  onChange={(e) => setWalkinName(e.target.value)}
                  placeholder="Walk-in Farmer"
                  aria-label="Walk-in name"
                  className="h-11"
                />
              )}
            </div>
            {!customer && (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CustomerPicker value={null} onChange={pickCustomer} />
                </div>
                <Button variant="secondary" size="sm" className="h-9" icon={<UserPlus className="size-4" />} onClick={() => setQuickAdd(true)}>
                  New
                </Button>
              </div>
            )}
            {customer && (
              <p className="text-xs text-[#5f6e60]">
                {[customer.village, customer.gstin && `GSTIN ${customer.gstin}`].filter(Boolean).join(" · ") || "Registered customer"}
                {" · "}
                <span className={n(customer.balance) > 0 ? "font-semibold text-[#c2412d]" : ""}>due {inr(customer.balance)}</span>
                {n(customer.creditLimit) > 0 && ` · limit ${inr0(customer.creditLimit)}`}
              </p>
            )}
            {overCredit && (
              <p className="flex items-start gap-1 text-xs font-medium text-[#c2412d]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                This bill takes the balance to {inr(projectedBalance)}, over the credit limit.
              </p>
            )}
          </div>

          {/* Lines */}
          <div className="max-h-[42vh] overflow-y-auto">
            {lines.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <ShoppingCart className="mx-auto size-7 text-slate-300" />
                <b className="mt-2 block text-[15px] text-[#1d2a1f]">Cart is empty</b>
                <span className="text-[13px] text-[#5f6e60]">Tap a product or scan its barcode.</span>
              </div>
            ) : (
              <ul className="divide-y divide-[#eef1e8]">
                {lines.map((l) => {
                  const sellable = l.batches?.filter((b) => !isExpired(b)) ?? [];
                  const chosen = sellable.find((b) => b.id === l.batchId);
                  const open = editing === l.key;
                  return (
                    <li key={l.key} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <b className="block truncate text-sm text-[#1d2a1f]">{l.product.name}</b>
                          <span className="text-xs text-[#5f6e60]">
                            {l.product.packSize || l.product.unit}
                            {" · "}
                            {chosen ? `Batch ${chosen.batchNo}` : "Batch auto (earliest expiry)"}
                            {n(l.discountPct) > 0 && ` · ${n(l.discountPct)}% off`}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <b className="num block text-sm">{inr(lineGross(l))}</b>
                          <span className="num text-xs text-[#5f6e60]">
                            {qty(l.quantity)} × {inr(l.rate)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-[#e1e6d8]">
                          <button onClick={() => step(l.key, -1)} className="flex size-8 items-center justify-center text-slate-600 hover:bg-slate-50" aria-label="Less">
                            <Minus className="size-3.5" />
                          </button>
                          <input
                            value={l.quantity}
                            onChange={(e) => update(l.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                            inputMode="decimal"
                            className="num h-8 w-12 border-x border-[#e1e6d8] text-center text-sm outline-none"
                            aria-label={`Quantity of ${l.product.name}`}
                          />
                          <button onClick={() => step(l.key, 1)} className="flex size-8 items-center justify-center text-slate-600 hover:bg-slate-50" aria-label="More">
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditing(open ? null : l.key)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            {open ? "Done" : "Edit"}
                          </button>
                          <button onClick={() => remove(l.key)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${l.product.name}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      {open && (
                        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9f3] p-2">
                          <label className="col-span-3 text-xs text-[#5f6e60]">
                            Batch
                            <Select value={l.batchId} onChange={(e) => update(l.key, { batchId: e.target.value })} disabled={l.batches === null} className="mt-0.5 h-8 text-xs">
                              <option value="">{l.batches === null ? "Loading…" : "Auto (earliest expiry)"}</option>
                              {sellable.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batchNo} · {b.expiryDate ? `exp ${date(b.expiryDate)}` : "no expiry"} · {qty(b.quantity)}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="col-span-2 text-xs text-[#5f6e60]">
                            Rate (incl. GST)
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.rate}
                              onChange={(e) => update(l.key, { rate: e.target.value })}
                              className="num mt-0.5 h-8 text-right"
                            />
                          </label>
                          <label className="text-xs text-[#5f6e60]">
                            Disc %
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={l.discountPct}
                              placeholder="0"
                              onChange={(e) => update(l.key, { discountPct: e.target.value })}
                              className="num mt-0.5 h-8 text-right"
                            />
                          </label>
                          {n(l.product.mrp) > 0 && n(l.rate) > n(l.product.mrp) && (
                            <p className="col-span-3 text-xs font-medium text-amber-700">Rate is above MRP ({inr(l.product.mrp)})</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Totals + payment */}
          <div className="space-y-3 border-t border-[#e1e6d8] p-4">
            {lines.length > 0 && (
              <dl className="space-y-1 text-sm">
                <Row label="Items total" value={inr(summary.itemsTotal)} />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#5f6e60]">Discount (₹)</dt>
                  <dd>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billDiscount}
                      placeholder="0"
                      onChange={(e) => {
                        setBillDiscount(e.target.value);
                        setReceived(null);
                      }}
                      className="num h-7 w-24 text-right"
                      aria-label="Bill discount"
                    />
                  </dd>
                </div>
                <Row label="Taxable value" value={inr(summary.taxable)} muted />
                {interState ? (
                  <Row label="IGST" value={inr(summary.tax)} muted />
                ) : (
                  <>
                    <Row label="CGST" value={inr(summary.tax / 2)} muted />
                    <Row label="SGST" value={inr(summary.tax / 2)} muted />
                  </>
                )}
                {summary.roundOff !== 0 && <Row label="Round off" value={inr(summary.roundOff)} muted />}
                <div className="flex items-baseline justify-between border-t border-[#e1e6d8] pt-2">
                  <dt className="font-semibold text-[#1d2a1f]">Total</dt>
                  <dd className="num font-display text-2xl font-bold text-[#1d2a1f]">{inr(summary.total)}</dd>
                </div>
              </dl>
            )}

            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => {
                const disabled = m.mode === "CREDIT" && !customer;
                return (
                  <button
                    key={m.mode}
                    type="button"
                    disabled={disabled}
                    title={disabled ? "Credit needs a registered customer" : undefined}
                    onClick={() => chooseMode(m.mode)}
                    className={cx(
                      "h-11 rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      mode === m.mode ? "border-brand-500 bg-[#e3f1e3] text-brand-700" : "border-[#e1e6d8] bg-white text-[#1d2a1f] hover:border-brand-500",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {mode === "CREDIT" && !customer && (
              <p className="flex items-center gap-1.5 rounded-lg bg-[#fbefd9] px-3 py-2 text-xs text-[#8a5a0f]">
                <AlertTriangle className="size-3.5" /> Credit needs a registered customer.
              </p>
            )}

            {lines.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-[#5f6e60]">
                  {mode === "CREDIT" ? "Advance received" : "Amount received"}
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={received ?? String(defaultReceived)}
                    onChange={(e) => setReceived(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="num mt-0.5 h-9 text-right"
                  />
                </label>
                {mode !== "CASH" && mode !== "CREDIT" ? (
                  <label className="text-xs text-[#5f6e60]">
                    {mode === "CHEQUE" ? "Cheque no." : mode === "UPI" ? "UPI ref / UTR" : "Reference"}
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className="mt-0.5 h-9" />
                  </label>
                ) : (
                  <div className="flex flex-col justify-end text-right">
                    {mode === "CASH" && change > 0 && (
                      <>
                        <span className="text-xs text-[#5f6e60]">Change to return</span>
                        <span className="num text-lg font-bold text-brand-700">{inr(change)}</span>
                      </>
                    )}
                    {due > 0 && customer && (
                      <>
                        <span className="text-xs text-[#5f6e60]">Added to dues</span>
                        <span className="num text-lg font-bold text-[#b7791f]">{inr(due)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex items-center gap-1 text-xs font-medium text-[#5f6e60] hover:text-[#1d2a1f]">
              <ChevronDown className={cx("size-3.5 transition-transform", moreOpen && "rotate-180")} /> More options
            </button>
            {moreOpen && (
              <div className="space-y-2">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes to print on the bill (dosage advice, vehicle no.…)" />
                <Checkbox label="Inter-state supply (IGST)" checked={interState} onChange={setInterState} />
              </div>
            )}

            <Button
              className="h-12 w-full text-[15px]"
              loading={saving}
              disabled={!lines.length || needBranch.blocked}
              icon={<Check className="size-4" />}
              onClick={() => void submit()}
            >
              Complete sale{lines.length ? ` · ${inr(summary.total)}` : ""}
            </Button>
            {lines.length > 0 && (
              <button onClick={newSale} className="w-full text-center text-sm font-medium text-[#5f6e60] hover:text-[#1d2a1f]">
                Clear cart
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Phone: bottom bar to jump to the bill */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[#e1e6d8] bg-white px-4 py-3 shadow-[0_-4px_14px_rgba(20,40,25,.08)] xl:hidden">
          <b className="num text-sm">
            {qty(summary.count)} item{summary.count === 1 ? "" : "s"} · {inr(summary.total)}
          </b>
          <Button className="bg-[#c9932a] hover:bg-[#b07b1c]" onClick={() => billRef.current?.scrollIntoView({ behavior: "smooth" })}>
            View bill
          </Button>
        </div>
      )}

      <CustomerForm
        open={quickAdd}
        quick
        onClose={() => setQuickAdd(false)}
        onSaved={(c) => {
          pickCustomer(c);
          setQuickAdd(false);
        }}
      />

      <Modal
        open={!!overLimit}
        onClose={() => setOverLimit(null)}
        title="Credit limit exceeded"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverLimit(null)}>
              Go back
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void submit(true)}>
              Bill anyway
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{overLimit}</p>
        <p className="mt-2 text-sm text-slate-600">As a manager you can approve this bill over the customer&apos;s credit limit.</p>
      </Modal>

      <Modal
        open={!!done}
        onClose={newSale}
        title="Sale complete"
        size="sm"
        footer={
          <>
            {waPhone && waPhone.length === 10 && (
              <a
                href={`https://wa.me/91${waPhone}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Send on WhatsApp
              </a>
            )}
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => done && router.push(`/sales/${done.id}?print=1`)}>
              Print bill
            </Button>
            <Button onClick={newSale}>New sale</Button>
          </>
        }
      >
        {done && (
          <div className="flex items-start gap-3 rounded-lg bg-[#e3f1e3] p-3 text-sm text-[#1d2a1f]">
            <Check className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <p>
              <b>{done.invoiceNo}</b> · {inr(done.totalAmount)} by {done.paymentMode.toLowerCase()}
              {n(done.totalAmount) > n(done.paidAmount) && (
                <>
                  <br />
                  <span className="text-[#b7791f]">{inr(n(done.totalAmount) - n(done.paidAmount))} added to dues</span>
                </>
              )}
              <br />
              <span className="text-xs text-[#5f6e60]">Batch numbers and expiry dates are printed on the bill.</span>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? "text-slate-500" : "text-[#5f6e60]"}>{label}</dt>
      <dd className={cx("num", muted ? "text-slate-500" : "font-medium text-[#1d2a1f]")}>{value}</dd>
    </div>
  );
}
