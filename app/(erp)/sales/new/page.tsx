"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  CloudOff,
  History,
  LockKeyholeOpen,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Split,
  Trash2,
  UserPlus,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { CameraScanner } from "@/components/CameraScanner";
import { ApprovalGate, approvalNeeded, type ApprovalNeed } from "@/components/ApprovalGate";
import { CustomerForm } from "@/components/CustomerForm";
import { CustomerPicker } from "@/components/pickers";
import { PrintPortal } from "@/components/PrintPortal";
import { ThermalReceipt, receiptFromSale, type ReceiptData } from "@/components/ThermalReceipt";
import { Button, Checkbox, Input, Modal, Select, Spinner, Textarea, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, dateTime, daysUntil, inr, inr0, n, qty, round2 } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import { isNetworkError, newOfflineId, queueAdd, queueList, queueRemove, syncQueue, useOnline, useQueue } from "@/lib/offline";
import { priceLines, type PricedLine } from "@/lib/pricing";
import { defaultPrintMode, printReceipt, receiptWidth } from "@/lib/print";
import { useScanner } from "@/lib/scanner";
import { MONEY_MODES, modeLabel, type Batch, type Category, type Customer, type HeldBill, type Paged, type PaymentMode, type Product, type RoleLimit, type Sale, type Scheme, type Shift, type StoreSettings } from "@/lib/types";

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

/** One part of a split payment */
interface Part {
  key: number;
  mode: PaymentMode;
  amount: string;
  reference: string;
}
let partSeq = 0;

/** What a held bill stores: the cart exactly as it was */
interface HoldPayload {
  lines: { productId: string; batchId: string | null; quantity: number; rate: number; discountPct: string }[];
  customerId: string | null;
  walkinName: string;
  phone: string;
  billDiscount: string;
  mode: PaymentMode;
  reference: string;
  notes: string;
  interState: boolean;
  govtReceipt: string;
  aadhaar: boolean;
}

interface Done {
  sale: Sale | null;
  receipt: ReceiptData;
  /** Saved on this device, waiting to sync */
  queued: boolean;
}

const MODES: { mode: PaymentMode; label: string }[] = [
  { mode: "CASH", label: "Cash" },
  { mode: "UPI", label: "UPI" },
  { mode: "CARD", label: "Card" },
  { mode: "KCC", label: "KCC" },
  { mode: "CREDIT", label: "Credit" },
  { mode: "BANK", label: "Bank" },
  { mode: "CHEQUE", label: "Cheque" },
];

const isExpired = (b: Batch) => !!b.expiryDate && (daysUntil(b.expiryDate) ?? 0) < 0;
/** Line value after the cashier's discount, the scheme and the customer-type discount (free goods are extra, at zero) */
const lineGross = (l: Line, p?: PricedLine) => n(l.quantity) * n(l.rate) * (1 - Math.min(100, p ? p.effectivePct : n(l.discountPct)) / 100);
/** Sellable stock in this branch for a product card */
const sellableOf = (p: PosProduct) => (p.sellable !== undefined ? p.sellable : n(p.stock));

export default function PosPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { current } = useBranch();
  const needBranch = useNeedBranch("bill from it");
  const searchRef = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLElement>(null);
  const keySeq = useRef(0);
  const online = useOnline();
  const queue = useQueue();

  // Catalogue for the grid: every active product with this branch's sellable stock and next expiry.
  // A copy is kept on the device so billing keeps working without internet.
  const catalogue = useApi<Paged<PosProduct>>(needBranch.blocked ? null : "/products", {
    status: "active",
    withExpiry: "true",
    pageSize: 500,
  });
  const { data: categories } = useApi<Category[]>("/categories");
  const { data: store } = useApi<StoreSettings>("/settings");
  // The cashier's open shift (counter cash is counted against it at close)
  const shiftQ = useApi<Shift | null>(needBranch.blocked ? null : "/shifts/current");
  const shift = shiftQ.data ?? null;
  // Running company schemes and this role's authority limits (both kept on the device for offline billing)
  const { data: schemes } = useApi<Scheme[]>(needBranch.blocked ? null : "/schemes/active");
  const { data: limits } = useApi<RoleLimit>("/roles/mine");
  const [need, setNeed] = useState<ApprovalNeed | null>(null);
  const overRef = useRef(false);
  // Bills parked on this branch's counters (hold / recall)
  const holds = useApi<HeldBill[]>(needBranch.blocked || !online ? null : "/sales/holds");
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [openShift, setOpenShift] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [openingShift, setOpeningShift] = useState(false);
  // Government fertiliser POS: required on bills with subsidised fertiliser
  const [govtReceipt, setGovtReceipt] = useState("");
  const [aadhaar, setAadhaar] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  /** Customer detail with overdue + credit-hold flags */
  const [credit, setCredit] = useState<Customer | null>(null);
  const [phone, setPhone] = useState("");
  const [walkinName, setWalkinName] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [billDiscount, setBillDiscount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [received, setReceived] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  // Split payment: several modes on one bill (cash + UPI, credit note + cash…)
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [interState, setInterState] = useState(false);
  const [notes, setNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [overLimit, setOverLimit] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [printData, setPrintData] = useState<ReceiptData | null>(null);

  const alertDays = store?.expiryAlertDays ?? 60;
  const products = useMemo(() => catalogue.data?.items ?? [], [catalogue.data]);

  const pickCustomer = useCallback(
    (c: Customer | null) => {
      setCustomer(c);
      setCredit(null);
      setInterState(c ? placeOfSupply(c, store).interState === true : false);
      setReceived(null);
      if (c?.phone) setPhone(c.phone);
      if (!c && mode === "CREDIT") setMode("CASH");
      // Credit position (overdue dues, hold) comes from the detail endpoint
      if (c) api.get<Customer>(`/customers/${c.id}`).then(setCredit).catch(() => {});
    },
    [store, mode],
  );

  // Preselect a customer from ?customerId=
  const presetId = params.get("customerId");
  useEffect(() => {
    if (!presetId) return;
    api
      .get<Customer>(`/customers/${presetId}`)
      .then((c) => {
        setCustomer(c);
        setCredit(c);
        setPhone(c.phone ?? "");
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [presetId, toast]);

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

  // ── Offline queue: sync whenever we come back online, and every minute as a safety net ──
  const toastRef = useRef(toast);
  const reloadRef = useRef(catalogue.reload);
  useEffect(() => {
    toastRef.current = toast;
    reloadRef.current = catalogue.reload;
  });
  const syncNow = useCallback(async () => {
    if (!queueList().length) return;
    const r = await syncQueue();
    if (r.synced) {
      toastRef.current.success(`${r.synced} offline bill${r.synced > 1 ? "s" : ""} synced to the server`);
      void reloadRef.current();
    }
    if (r.failed) toastRef.current.error(`${r.failed} queued bill${r.failed > 1 ? "s were" : " was"} rejected — open Pending sync to fix`);
  }, []);
  useEffect(() => {
    if (online) void syncNow();
    const t = setInterval(() => navigator.onLine && void syncNow(), 60_000);
    return () => clearInterval(t);
  }, [online, syncNow]);

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
    // Batches for this branch, for the optional batch choice (not available offline — auto FEFO still applies)
    api
      .get<Product>(`/products/${p.id}`)
      .then((full) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, batches: full.batches ?? [] } : l))))
      .catch(() => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, batches: [] } : l))));
  }

  /** Barcode from a USB/Bluetooth scanner or the camera */
  function scanCode(code: string) {
    const q = code.trim().toLowerCase();
    if (!q) return;
    const hit = products.find((p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q);
    if (!hit) {
      toast.error(`No product with barcode ${code} — add it to the product first`);
      return;
    }
    addProduct(hit);
    setSearch("");
  }
  useScanner(scanCode, !done && !camOpen && !quickAdd);

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
    // Typed by hand: an exact code or a single match adds the product
    const exact = products.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
    const pick = exact ?? (visible.length === 1 ? visible[0] : null);
    if (pick) {
      addProduct(pick);
      setSearch("");
    }
  }

  // ── Pricing rules (mirrors the server): cashier discount → best scheme per line → customer-type discount ──
  const pricing = useMemo(() => {
    const r = priceLines(
      lines.map((l) => ({ productId: l.product.id, quantity: n(l.quantity), rate: n(l.rate), manualPct: Math.min(100, Math.max(0, n(l.discountPct))), isSubsidised: !!l.product.isSubsidised })),
      schemes ?? [],
      (credit ?? customer)?.customerType,
    );
    const byKey = new Map<number, PricedLine>();
    lines.forEach((l, i) => byKey.set(l.key, r.lines[i]));
    return { ...r, byKey };
  }, [lines, schemes, customer, credit]);

  // ── Bill math (mirrors the server: GST-inclusive rates, bill discount spread pro-rata) ──
  const summary = useMemo(() => {
    const itemsTotal = lines.reduce((s, l) => s + lineGross(l, pricing.byKey.get(l.key)), 0);
    const discount = Math.min(n(billDiscount), itemsTotal);
    const factor = itemsTotal > 0 ? 1 - discount / itemsTotal : 1;
    let tax = 0;
    for (const l of lines) {
      const amt = lineGross(l, pricing.byKey.get(l.key)) * factor;
      tax += amt - amt / (1 + n(l.product.gstRate) / 100);
    }
    const net = itemsTotal - discount;
    const total = Math.round(net);
    // The cashier's own discount (schemes and customer types don't count against the limit)
    const manualMax = round2(Math.max(0, ...lines.map((l) => Math.min(100, n(l.discountPct))), itemsTotal > 0 ? (discount / itemsTotal) * 100 : 0));
    return {
      itemsTotal: round2(itemsTotal),
      discount: round2(discount),
      factor,
      tax: round2(tax),
      taxable: round2(net - tax),
      roundOff: round2(total - net),
      total,
      count: lines.reduce((s, l) => s + n(l.quantity), 0),
      manualMax,
    };
  }, [lines, billDiscount, pricing]);
  const aboveLimit = !!limits && limits.maxDiscountPct !== null && summary.manualMax > n(limits.maxDiscountPct) + 1e-9;

  const defaultReceived = mode === "CREDIT" ? 0 : summary.total;
  const receivedAmt = received === null ? defaultReceived : n(received);
  const partsTotal = round2(parts.reduce((s, p) => s + n(p.amount), 0));
  const change = !split && mode === "CASH" ? round2(receivedAmt - summary.total) : 0;
  const paidAmount = round2(Math.min(split ? partsTotal : receivedAmt, summary.total));
  const due = round2(summary.total - paidAmount);
  // Credit notes the customer still holds (from the customer detail; applied as a payment mode)
  const availableCredit = round2(n(credit?.creditNoteBalance));
  const creditNoteUsed = round2(parts.filter((p) => p.mode === "CREDIT_NOTE").reduce((s, p) => s + n(p.amount), 0));
  const projectedBalance = customer ? round2(n(customer.balance) + due) : 0;
  const overCredit = !!customer && n(customer.creditLimit) > 0 && due > 0 && projectedBalance > n(customer.creditLimit);
  const creditHold = (credit ?? customer)?.creditHold ?? false;
  const overdue = credit?.overdue;
  const subsidisedLines = lines.filter((l) => l.product.isSubsidised);
  const needsGovt = subsidisedLines.length > 0;
  const govtMissing = needsGovt && !govtReceipt.trim();
  const shiftMissing = !!store?.requireOpenShift && online && shiftQ.data === null && !shiftQ.loading;

  async function doOpenShift(e: React.FormEvent) {
    e.preventDefault();
    setOpeningShift(true);
    try {
      await api.post("/shifts", { openingFloat: n(openingFloat) });
      toast.success("Shift opened");
      setOpenShift(false);
      void shiftQ.reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setOpeningShift(false);
    }
  }

  function chooseMode(m: PaymentMode) {
    setMode(m);
    setSplit(false);
    setReceived(null);
    if (m === "CASH" || m === "CREDIT") setReference("");
  }

  /** Switch to a split payment; with a credit note first when the customer has one */
  function startSplit(withCreditNote = false) {
    const note = withCreditNote ? round2(Math.min(availableCredit, summary.total)) : 0;
    const rows: Part[] = [];
    if (note > 0) rows.push({ key: ++partSeq, mode: "CREDIT_NOTE", amount: String(note), reference: "" });
    rows.push({ key: ++partSeq, mode: "CASH", amount: String(round2(summary.total - note)), reference: "" });
    setParts(rows);
    setSplit(true);
    setReceived(null);
  }
  const updatePart = (key: number, patch: Partial<Part>) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePart = (key: number) => setParts((ps) => ps.filter((p) => p.key !== key));
  function addPart() {
    const rest = round2(Math.max(0, summary.total - partsTotal));
    setParts((ps) => [...ps, { key: ++partSeq, mode: ps.some((p) => p.mode === "CASH") ? "UPI" : "CASH", amount: rest ? String(rest) : "", reference: "" }]);
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
    if (due > 0 && creditHold) return `Credit is on hold for ${customer?.name} — collect the dues first or ask a manager to lift the hold`;
    if (phone && phone.length !== 10) return "Enter a valid 10-digit mobile number";
    if (split) {
      if (!parts.length) return "Add a payment line or switch off split payment";
      if (parts.some((p) => n(p.amount) <= 0)) return "Every payment line needs an amount";
      if (partsTotal > summary.total + 0.004) return `Payments (${inr(partsTotal)}) exceed the bill total`;
      if (creditNoteUsed > 0 && !customer) return "A credit note needs a registered customer";
      if (creditNoteUsed > availableCredit + 0.004) return `Only ${inr(availableCredit)} of credit note is available for ${customer?.name}`;
    }
    if (govtMissing) return "Sell the subsidised fertiliser on the govt POS device first, then enter its receipt no.";
    if (shiftMissing) return "Open your shift (enter the opening cash) before billing";
    return null;
  }

  /** Receipt built from the cart, for bills made offline (the server numbers them later) */
  function buildReceipt(ref: string): ReceiptData {
    return {
      invoiceNo: ref,
      date: new Date().toISOString(),
      customerName: customer?.name ?? (walkinName.trim() || null),
      customerPhone: customer?.phone ?? (phone || null),
      lines: lines.flatMap((l) => {
        const p = pricing.byKey.get(l.key);
        const paid = { name: l.product.name, qty: n(l.quantity), unit: l.product.unit, rate: n(l.rate), amount: round2(lineGross(l, p) * summary.factor), gstRate: n(l.product.gstRate) };
        return p && p.freeQty > 0 ? [paid, { name: `${l.product.name} (free - ${p.schemeName})`, qty: p.freeQty, unit: l.product.unit, rate: 0, amount: 0, gstRate: n(l.product.gstRate) }] : [paid];
      }),
      taxable: summary.taxable,
      discount: summary.discount,
      tax: summary.tax,
      isInterState: interState,
      roundOff: summary.roundOff,
      total: summary.total,
      paid: paidAmount,
      paymentMode: split ? "Split" : modeLabel(mode),
      payments: split ? parts.map((p) => ({ mode: modeLabel(p.mode), amount: n(p.amount), reference: p.reference.trim() || null })) : undefined,
      notes: notes.trim() || null,
      govtReceiptNo: govtReceipt.trim() || null,
      provisional: true,
    };
  }

  function queueSale(body: Record<string, unknown>) {
    if (!current) return toast.error("Pick a branch in the top bar to bill from");
    if (overCredit) return toast.error("Over the credit limit — a manager can override this only when online");
    const id = newOfflineId();
    const receipt = buildReceipt(`OFFLINE-${id.slice(-6).toUpperCase()}`);
    queueAdd({
      id,
      createdAt: new Date().toISOString(),
      branchId: current.id,
      payload: body,
      summary: { total: summary.total, items: lines.length, customerName: receipt.customerName ?? null, phone: receipt.customerPhone ?? null },
      receipt,
      error: null,
      attempts: 0,
    });
    // Keep the on-screen stock honest until the bill syncs
    catalogue.setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((p) => {
              const q = lines.filter((l) => l.product.id === p.id).reduce((s, l) => s + n(l.quantity), 0);
              return q ? { ...p, sellable: sellableOf(p) - q, stock: n(p.stock) - q } : p;
            }),
          }
        : d,
    );
    setOverLimit(null);
    setDone({ sale: null, receipt, queued: true });
    toast.success("No connection — bill saved on this device; it will sync automatically");
  }

  async function submit(allowOverCreditLimit = false, approvalId?: string) {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    overRef.current = allowOverCreditLimit;
    const body = {
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
      paymentMode: split ? undefined : mode,
      paymentReference: split ? undefined : reference.trim() || undefined,
      payments: split ? parts.map((p) => ({ mode: p.mode, amount: n(p.amount), reference: p.reference.trim() || undefined })) : undefined,
      isInterState: interState,
      allowOverCreditLimit: allowOverCreditLimit || undefined,
      notes: notes.trim() || undefined,
      govtReceiptNo: needsGovt ? govtReceipt.trim() : undefined,
      aadhaarVerified: needsGovt ? aadhaar : undefined,
      approvalId,
    };
    if (!online) {
      if (aboveLimit && !approvalId) return toast.error(`A discount above ${n(limits?.maxDiscountPct)}% needs a manager's approval, which needs internet`);
      return queueSale(body);
    }
    setSaving(true);
    try {
      const sale = await api.post<Sale>("/sales", body);
      setOverLimit(null);
      setNeed(null);
      setDone({ sale, receipt: receiptFromSale(sale), queued: false });
      void catalogue.reload();
    } catch (e) {
      if (isNetworkError(e)) {
        queueSale(body);
        return;
      }
      const approval = approvalNeeded(e, { customer: customer?.name ?? (walkinName.trim() || "Walk-in"), items: lines.length, total: summary.total });
      if (approval) {
        setNeed(approval);
        return;
      }
      const msg = errMsg(e);
      if (e instanceof ApiError && /credit limit/i.test(msg) && can("approvals.decide") && !allowOverCreditLimit) setOverLimit(msg);
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
    setCredit(null);
    setMode("CASH");
    setSplit(false);
    setParts([]);
    setInterState(false);
    setEditing(null);
    setGovtReceipt("");
    setAadhaar(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  // ── Hold / recall: park the cart on the server so any counter of the branch can pick it up ──
  async function holdBill() {
    setHolding(true);
    try {
      const payload: HoldPayload = {
        lines: lines.map((l) => ({ productId: l.product.id, batchId: l.batchId || null, quantity: n(l.quantity), rate: n(l.rate), discountPct: l.discountPct })),
        customerId: customer?.id ?? null,
        walkinName,
        phone,
        billDiscount,
        mode,
        reference,
        notes,
        interState,
        govtReceipt,
        aadhaar,
      };
      const h = await api.post<HeldBill>("/sales/holds", {
        customerId: customer?.id,
        customerName: customer ? undefined : walkinName.trim() || undefined,
        label: holdLabel?.trim() || undefined,
        total: summary.total,
        itemCount: lines.length,
        payload,
      });
      toast.success(`Bill held as #${h.holdNo} — recall it from the Recall button`);
      setHoldLabel(null);
      newSale();
      void holds.reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setHolding(false);
    }
  }

  async function recall(h: HeldBill) {
    const p = h.payload as unknown as HoldPayload;
    const rebuilt: Line[] = [];
    let missing = 0;
    for (const hl of p.lines ?? []) {
      const prod = products.find((x) => x.id === hl.productId);
      if (!prod) {
        missing++;
        continue;
      }
      rebuilt.push({ key: ++keySeq.current, product: prod, batches: null, batchId: hl.batchId ?? "", quantity: String(hl.quantity), rate: String(hl.rate), discountPct: hl.discountPct ?? "" });
    }
    newSale();
    setLines(rebuilt);
    for (const l of rebuilt) {
      api
        .get<Product>(`/products/${l.product.id}`)
        .then((full) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, batches: full.batches ?? [] } : x))))
        .catch(() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, batches: [] } : x))));
    }
    if (p.customerId) {
      try {
        const c = await api.get<Customer>(`/customers/${p.customerId}`);
        setCustomer(c);
        setCredit(c);
        setPhone(c.phone ?? "");
      } catch {
        /* customer gone: continue as walk-in */
      }
    } else {
      setWalkinName(p.walkinName ?? "");
      setPhone(p.phone ?? "");
    }
    setBillDiscount(p.billDiscount ?? "");
    setMode(p.mode ?? "CASH");
    setReference(p.reference ?? "");
    setNotes(p.notes ?? "");
    setInterState(!!p.interState);
    setGovtReceipt(p.govtReceipt ?? "");
    setAadhaar(!!p.aadhaar);
    setHoldsOpen(false);
    try {
      await api.del(`/sales/holds/${h.id}`);
    } catch {
      /* already taken by another counter */
    }
    void holds.reload();
    if (missing) toast.error(`${missing} product${missing > 1 ? "s" : ""} from hold #${h.holdNo} ${missing > 1 ? "are" : "is"} no longer on sale`);
    else toast.success(`Recalled hold #${h.holdNo}`);
  }

  /** Thermal receipt from the page, or the A4 invoice page */
  function printBill(which?: "receipt" | "a4") {
    if (!done) return;
    const w = which ?? (done.queued || defaultPrintMode(store) === "thermal" ? "receipt" : "a4");
    if (w === "a4" && done.sale) {
      router.push(`/sales/${done.sale.id}?print=1`);
      return;
    }
    setPrintData(done.receipt);
    setTimeout(() => printReceipt(receiptWidth(store)), 150);
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
        `Thank you for shopping at ${store?.storeName ?? "our store"}! Bill ${done.receipt.invoiceNo} for ${inr(done.receipt.total)}` +
          (done.receipt.total > done.receipt.paid ? ` (balance due ${inr(done.receipt.total - done.receipt.paid)})` : "") +
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
            Scan a barcode or tap a product. The earliest-expiring batch is picked automatically; expired stock can&apos;t be billed.
            <span className="hidden lg:inline">
              {" "}
              <kbd className="rounded border border-slate-300 bg-white px-1 text-[11px]">F2</kbd> search ·{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1 text-[11px]">F9</kbd> complete sale
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
              <WifiOff className="size-3.5" /> Offline — bills are saved on this device
            </span>
          )}
          {queue.length > 0 && (
            <Button variant="secondary" icon={<CloudOff className="size-4" />} onClick={() => setQueueOpen(true)}>
              Pending sync · {queue.length}
            </Button>
          )}
          {!needBranch.blocked &&
            (shift ? (
              <Link
                href="/shifts"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-2.5 text-xs font-semibold text-brand-800"
                title="Your open shift — close it from Shifts & Cash"
              >
                <LockKeyholeOpen className="size-3.5" /> Shift {shift.shiftNo.split("/").pop()} · float {inr0(shift.openingFloat)}
              </Link>
            ) : (
              <Button
                variant={store?.requireOpenShift ? "primary" : "secondary"}
                icon={<LockKeyholeOpen className="size-4" />}
                onClick={() => setOpenShift(true)}
                title="Enter the opening cash to start your shift"
              >
                Open shift
              </Button>
            ))}
          {lines.length > 0 && online && !needBranch.blocked && (
            <Button variant="secondary" icon={<PauseCircle className="size-4" />} onClick={() => setHoldLabel("")} title="Park this cart and serve the next farmer; recall it later on any counter">
              Hold bill
            </Button>
          )}
          {online && !needBranch.blocked && (holds.data?.length ?? 0) > 0 && (
            <Button variant="secondary" icon={<History className="size-4" />} onClick={() => setHoldsOpen(true)}>
              Recall · {holds.data?.length}
            </Button>
          )}
          <Link href="/sales">
            <Button variant="secondary" icon={<ReceiptText className="size-4" />}>
              Invoices
            </Button>
          </Link>
        </div>
      </div>

      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ── Products ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
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
            <button
              type="button"
              onClick={() => setCamOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e1e6d8] bg-white px-3 text-sm font-medium text-[#1d2a1f] hover:border-brand-500"
              title="Scan with the camera"
            >
              <Camera className="size-4" />
              <span className="hidden sm:inline">Camera</span>
            </button>
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
          ) : catalogue.error && !catalogue.data ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-10 text-center text-sm text-amber-800">
              <b className="block">Could not load the catalogue</b>
              {online ? catalogue.error : "You are offline and this device has no saved copy yet. Open the POS once while online."}
            </div>
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
                {[customer.village, customer.gstin && `GSTIN ${customer.gstin}`, customer.customerType?.name && `${customer.customerType.name} · ${n(customer.customerType.discountPct)}% off`].filter(Boolean).join(" · ") || "Registered customer"}
                {" · "}
                <span className={n(customer.balance) > 0 ? "font-semibold text-[#c2412d]" : ""}>due {inr(customer.balance)}</span>
                {n(customer.creditLimit) > 0 && ` · limit ${inr0(customer.creditLimit)}`}
                {customer.creditDays > 0 && ` · ${customer.creditDays} days credit`}
              </p>
            )}
            {customer && availableCredit > 0 && (
              <p className="flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                <span>
                  Credit note available: <b className="num">{inr(availableCredit)}</b>
                </span>
                {lines.length > 0 && creditNoteUsed === 0 && (
                  <button type="button" className="font-semibold underline" onClick={() => startSplit(true)}>
                    Apply to this bill
                  </button>
                )}
              </p>
            )}
            {customer && creditHold && (
              <p className="flex items-start gap-1 rounded-lg bg-[#fbe4df] px-2.5 py-1.5 text-xs font-semibold text-[#c2412d]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Credit is on hold for this customer — cash, UPI or card only.
              </p>
            )}
            {customer && !creditHold && overdue && overdue.amount > 0 && (
              <p className="flex items-start gap-1 text-xs font-medium text-[#c2412d]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {inr(overdue.amount)} overdue by {overdue.days} days — collect it with this bill.
              </p>
            )}
            {overCredit && (
              <p className="flex items-start gap-1 text-xs font-medium text-[#c2412d]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                This bill takes the balance to {inr(projectedBalance)}, over the credit limit.
              </p>
            )}
          </div>

          {/* Government fertiliser POS — subsidised lines are sold on the govt device first */}
          {needsGovt && (
            <div className={cx("space-y-2 border-b p-4", govtMissing ? "border-[#f3c9c1] bg-[#fff5f2]" : "border-[#e1e6d8] bg-[#f3faf3]")}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1d2a1f]">
                <ShieldCheck className={cx("size-4", govtMissing ? "text-[#c2412d]" : "text-brand-700")} />
                Subsidised fertiliser: {subsidisedLines.map((l) => l.product.name).join(", ")}
              </p>
              <Input
                value={govtReceipt}
                onChange={(e) => setGovtReceipt(e.target.value.toUpperCase())}
                placeholder="Govt fertiliser POS receipt no. (required)"
                aria-label="Govt fertiliser POS receipt no."
                className={cx("h-10 font-mono", govtMissing && "border-[#e0a097]")}
              />
              <Checkbox label="Aadhaar verified on the govt device" checked={aadhaar} onChange={setAadhaar} />
              {govtMissing && <p className="text-xs text-[#c2412d]">Can&apos;t complete until the govt POS receipt no. is entered.</p>}
            </div>
          )}

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
                          <LinePricing p={pricing.byKey.get(l.key)} unit={l.product.unit} />
                        </div>
                        <div className="shrink-0 text-right">
                          <b className="num block text-sm">{inr(lineGross(l, pricing.byKey.get(l.key)))}</b>
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
                {aboveLimit && (
                  <p className="text-xs font-medium text-amber-700">
                    {summary.manualMax}% is above your {n(limits?.maxDiscountPct)}% limit — a manager&apos;s PIN or approval will be asked on completing the sale
                  </p>
                )}
                {pricing.typeName && <Row label={`${pricing.typeName} price`} value={pricing.typeApplied ? "applied" : `from ${inr0(pricing.minBill)}`} muted />}
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

            <div className="grid grid-cols-4 gap-2">
              {MODES.map((m) => {
                const disabled = m.mode === "CREDIT" && (!customer || creditHold);
                return (
                  <button
                    key={m.mode}
                    type="button"
                    disabled={disabled}
                    title={disabled ? (creditHold ? "Credit is on hold" : "Credit needs a registered customer") : m.mode === "KCC" ? "Kisan Credit Card (settles to the bank)" : undefined}
                    onClick={() => chooseMode(m.mode)}
                    className={cx(
                      "h-11 rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      !split && mode === m.mode ? "border-brand-500 bg-[#e3f1e3] text-brand-700" : "border-[#e1e6d8] bg-white text-[#1d2a1f] hover:border-brand-500",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => (split ? setSplit(false) : startSplit(false))}
                title="Pay with more than one mode, e.g. part cash + part UPI, or apply a credit note"
                className={cx(
                  "inline-flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors",
                  split ? "border-brand-500 bg-[#e3f1e3] text-brand-700" : "border-[#e1e6d8] bg-white text-[#1d2a1f] hover:border-brand-500",
                )}
              >
                <Split className="size-4" /> Split
              </button>
            </div>

            {mode === "CREDIT" && !customer && (
              <p className="flex items-center gap-1.5 rounded-lg bg-[#fbefd9] px-3 py-2 text-xs text-[#8a5a0f]">
                <AlertTriangle className="size-3.5" /> Credit needs a registered customer.
              </p>
            )}

            {lines.length > 0 && split && (
              <div className="space-y-2 rounded-lg bg-[#f7f9f3] p-2">
                {parts.map((p) => (
                  <div key={p.key} className="flex items-center gap-1.5">
                    <Select value={p.mode} onChange={(e) => updatePart(p.key, { mode: e.target.value as PaymentMode, reference: "" })} className="h-8 w-32 text-xs" aria-label="Payment mode">
                      {MONEY_MODES.map((m) => (
                        <option key={m} value={m}>
                          {modeLabel(m)}
                        </option>
                      ))}
                      {customer && availableCredit > 0 && <option value="CREDIT_NOTE">Credit note</option>}
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={p.amount}
                      onChange={(e) => updatePart(p.key, { amount: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      className="num h-8 w-24 text-right"
                      aria-label="Amount"
                    />
                    {p.mode !== "CASH" && p.mode !== "CREDIT_NOTE" ? (
                      <Input value={p.reference} onChange={(e) => updatePart(p.key, { reference: e.target.value })} placeholder={p.mode === "CHEQUE" ? "Cheque no." : p.mode === "UPI" ? "UTR" : "Ref"} className="h-8 min-w-0 flex-1 text-xs" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[#5f6e60]">{p.mode === "CREDIT_NOTE" ? `of ${inr(availableCredit)} available` : ""}</span>
                    )}
                    <button type="button" onClick={() => removePart(p.key)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove payment line">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={addPart} className="font-semibold text-brand-700 hover:underline">
                    + Add payment line
                  </button>
                  <span className={cx("num font-semibold", partsTotal > summary.total + 0.004 ? "text-red-600" : due > 0 ? "text-[#b7791f]" : "text-brand-700")}>
                    {partsTotal > summary.total + 0.004 ? `Over by ${inr(partsTotal - summary.total)}` : due > 0 ? `${inr(due)} left${customer ? " → added to dues" : " (needs a customer)"}` : "Fully paid"}
                  </span>
                </div>
              </div>
            )}

            {lines.length > 0 && !split && (
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
                    {mode === "CHEQUE" ? "Cheque no." : mode === "UPI" ? "UPI ref / UTR" : mode === "KCC" ? "KCC card / txn no." : "Reference"}
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

            {shiftMissing && (
              <p className="flex items-center justify-between gap-2 rounded-lg bg-[#fbefd9] px-3 py-2 text-xs text-[#8a5a0f]">
                <span>No shift open — enter the opening cash first.</span>
                <button type="button" className="font-semibold underline" onClick={() => setOpenShift(true)}>
                  Open shift
                </button>
              </p>
            )}
            <Button
              className="h-12 w-full text-[15px]"
              loading={saving}
              disabled={!lines.length || needBranch.blocked || govtMissing || shiftMissing}
              icon={online ? <Check className="size-4" /> : <CloudOff className="size-4" />}
              onClick={() => void submit()}
            >
              {online ? "Complete sale" : "Save bill offline"}
              {lines.length ? ` · ${inr(summary.total)}` : ""}
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

      <Modal
        open={holdLabel !== null}
        onClose={() => setHoldLabel(null)}
        title="Hold this bill"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHoldLabel(null)}>
              Cancel
            </Button>
            <Button loading={holding} icon={<PauseCircle className="size-4" />} onClick={() => void holdBill()}>
              Hold · {inr(summary.total)}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The cart is parked for this branch; any counter can recall it. Stock is not reserved.</p>
        <Input className="mt-3" value={holdLabel ?? ""} onChange={(e) => setHoldLabel(e.target.value)} placeholder="Note, e.g. gone to ATM / blue shirt (optional)" autoFocus />
      </Modal>

      <Modal open={holdsOpen} onClose={() => setHoldsOpen(false)} title="Held bills" size="md">
        {!holds.data?.length ? (
          <p className="py-6 text-center text-sm text-slate-400">Nothing on hold</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {holds.data.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="num w-10 shrink-0 font-semibold text-slate-700">#{h.holdNo}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">
                    {h.customer?.name ?? h.customerName ?? "Walk-in"}
                    {h.label && <span className="font-normal text-slate-500"> · {h.label}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {h.itemCount} item{h.itemCount === 1 ? "" : "s"} · {inr(h.total)} · {dateTime(h.createdAt)} · {h.user?.name}
                  </p>
                </div>
                <Button size="sm" onClick={() => void recall(h)}>
                  Recall
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  aria-label="Discard held bill"
                  onClick={async () => {
                    if (!(await confirm(`Discard held bill #${h.holdNo}?`, { danger: true, confirmLabel: "Discard" }))) return;
                    try {
                      await api.del(`/sales/holds/${h.id}`);
                      void holds.reload();
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ApprovalGate
        need={need}
        onClose={() => setNeed(null)}
        onApproved={(id, by) => {
          setNeed(null);
          toast.success(`Approved by ${by}`);
          void submit(overRef.current, id);
        }}
      />

      <CustomerForm
        open={quickAdd}
        quick
        onClose={() => setQuickAdd(false)}
        onSaved={(c) => {
          pickCustomer(c);
          setQuickAdd(false);
        }}
      />

      <CameraScanner
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onScan={(code) => {
          setCamOpen(false);
          scanCode(code);
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
        title={done?.queued ? "Bill saved offline" : "Sale complete"}
        size="sm"
        footer={
          <>
            {waPhone && waPhone.length === 10 && !done?.queued && (
              <a
                href={`https://wa.me/91${waPhone}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                WhatsApp
              </a>
            )}
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => printBill()}>
              {done?.queued || defaultPrintMode(store) === "thermal" ? "Print receipt" : "Print invoice"}
            </Button>
            {done?.sale && (
              <Button variant="ghost" onClick={() => printBill(defaultPrintMode(store) === "thermal" ? "a4" : "receipt")}>
                {defaultPrintMode(store) === "thermal" ? "A4 invoice" : "Receipt"}
              </Button>
            )}
            <Button onClick={newSale}>New sale</Button>
          </>
        }
      >
        {done && (
          <div className={cx("flex items-start gap-3 rounded-lg p-3 text-sm text-[#1d2a1f]", done.queued ? "bg-[#fbefd9]" : "bg-[#e3f1e3]")}>
            {done.queued ? <CloudOff className="mt-0.5 size-5 shrink-0 text-[#8a5a0f]" /> : <Check className="mt-0.5 size-5 shrink-0 text-brand-700" />}
            <p>
              <b>{done.receipt.invoiceNo}</b> · {inr(done.receipt.total)}{" "}
              {done.receipt.payments && done.receipt.payments.length > 1
                ? `by ${done.receipt.payments.map((p) => `${p.mode} ${inr(p.amount)}`).join(" + ")}`
                : `by ${done.receipt.paymentMode.toLowerCase()}`}
              {done.receipt.total > done.receipt.paid && (
                <>
                  <br />
                  <span className="text-[#b7791f]">{inr(done.receipt.total - done.receipt.paid)} added to dues</span>
                </>
              )}
              <br />
              <span className="text-xs text-[#5f6e60]">
                {done.queued
                  ? "Saved on this device. It will be sent to the server and get its invoice number as soon as the connection is back."
                  : "Batch numbers and expiry dates are printed on the bill."}
              </span>
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        title={`Pending sync · ${queue.length} bill${queue.length === 1 ? "" : "s"}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQueueOpen(false)}>
              Close
            </Button>
            <Button icon={<RefreshCw className="size-4" />} onClick={() => void syncNow()} disabled={!online}>
              Sync now
            </Button>
          </>
        }
      >
        {queue.length === 0 ? (
          <p className="text-sm text-slate-500">Everything is synced.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {queue.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {q.summary.customerName ?? "Walk-in"} · {inr(q.summary.total)} · {q.summary.items} item{q.summary.items === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {dateTime(q.createdAt)} · ref {(q.receipt as ReceiptData).invoiceNo}
                  </p>
                  {q.error && <p className="mt-0.5 text-xs font-medium text-red-600">Rejected: {q.error}</p>}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Printer className="size-4" />}
                    onClick={() => {
                      setPrintData(q.receipt as ReceiptData);
                      setTimeout(() => printReceipt(receiptWidth(store)), 150);
                    }}
                  >
                    Receipt
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      if (await confirm("Remove this offline bill? It will never reach the server — only do this if it was billed again or by mistake.", { danger: true, confirmLabel: "Remove" })) {
                        queueRemove(q.id);
                        void catalogue.reload();
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!online && queue.length > 0 && <p className="mt-3 text-xs text-amber-700">You are offline — bills sync automatically when the connection returns.</p>}
      </Modal>

      <Modal
        open={openShift}
        onClose={() => setOpenShift(false)}
        title="Open shift"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenShift(false)}>
              Cancel
            </Button>
            <Button type="submit" form="pos-open-shift" loading={openingShift}>
              Open shift
            </Button>
          </>
        }
      >
        <form id="pos-open-shift" onSubmit={doOpenShift}>
          <label className="text-xs text-[#5f6e60]">
            Opening cash in the drawer (₹)
            <Input type="number" min="0" step="1" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} autoFocus required className="num mt-1 h-11 text-lg" />
          </label>
          <p className="mt-2 text-xs text-[#5f6e60]">Count the float before the first bill. Cash sales, refunds and cash expenses are tallied against this shift when you close it.</p>
        </form>
      </Modal>

      <PrintPortal className="thermal-host">{printData && <ThermalReceipt data={printData} settings={store} width={receiptWidth(store)} />}</PrintPortal>
    </div>
  );
}

/** Scheme, free goods and customer-type discount on a cart line */
function LinePricing({ p, unit }: { p?: PricedLine; unit: string }) {
  if (!p || (!p.schemeName && !p.typePct)) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
      {p.schemeName && (
        <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-800">
          {p.schemeName}
          {p.freeQty > 0 ? ` · +${qty(p.freeQty)} ${unit} free` : p.schemePct > 0 ? ` · ${p.schemePct}% off` : p.toNextFree ? ` · ${p.toNextFree} more for a free one` : ""}
        </span>
      )}
      {p.typePct > 0 && <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-800">{p.typePct}% customer type</span>}
    </span>
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
