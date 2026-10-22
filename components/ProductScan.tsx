"use client";

import { ExternalLink, MapPin, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { inr, n, qty } from "@/lib/format";
import { cameraScanSupported, isTypingTarget, useScanner } from "@/lib/scanner";
import type { Product } from "@/lib/types";
import { LazyCameraScanner } from "./lazy";
import { ExpiryBadge } from "./StockBits";
import { Badge, Button, cx, errMsg, InfinityLoader, Modal, TOP_ICON_BUTTON, useToast } from "./ui";

/** Pages that use a scan for their own work (add to the bill, receive a PO line), so the lookup stays out of their way */
const OWN_SCAN_PAGES = ["/sales/new", "/goods-inward/new"];

/**
 * Scan a product's barcode from anywhere in the app and see its details: a USB / Bluetooth scanner works on
 * every page, and phones / tablets get a camera button in the top bar. Also matches a SKU or a serial number.
 * Scans typed into a text box are left to that box (e.g. the barcode field of the product form).
 */
export function ProductScan() {
  const pathname = usePathname();
  const { can } = useAuth();
  const toast = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  // The top bar only renders in the browser after sign-in (the server sends the loading screen), so this is safe here
  const camera = cameraScanSupported();

  // Same people the API lets look a product up: Inventory, or the selling / buying screens (PRODUCT_READ in the API)
  const allowed = can("products.view", "sales.bill", "sales.returns", "sales.van", "purchases.view", "grn.view", "invoices.view", "notes.view", "inventory.view", "inventory.adjust", "inventory.transfer") && !OWN_SCAN_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const lookup = useCallback(
    async (code: string) => {
      setLooking(code);
      try {
        setProduct(await api.get<Product>(`/products/scan/${encodeURIComponent(code)}`));
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setLooking(null);
      }
    },
    [toast],
  );

  useScanner(lookup, allowed && !camOpen, (t) => {
    if (isTypingTarget(t)) return true;
    // Another dialog is open (its own work in progress): don't cover it. A new scan over this one replaces it.
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]').length;
    return dialogs > (product ? 1 : 0);
  });

  if (!allowed) return null;

  return (
    <>
      {camera && (
        <button type="button" onClick={() => setCamOpen(true)} className={TOP_ICON_BUTTON} aria-label="Scan Barcode" title="Scan Barcode">
          {looking ? <InfinityLoader className="size-5" /> : <ScanLine className="size-5" />}
        </button>
      )}

      {/* A hardware scan shows progress here, since there may be no camera button to spin */}
      {looking && !camera && (
        <div role="status" className="no-print fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-slate-600 shadow-lg">
          <InfinityLoader className="size-5" /> Looking up {looking}…
        </div>
      )}

      <LazyCameraScanner
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onScan={(code) => {
          setCamOpen(false);
          void lookup(code);
        }}
      />

      {product && <ProductCard product={product} onClose={() => setProduct(null)} onScanAgain={camera ? () => (setProduct(null), setCamOpen(true)) : undefined} />}
    </>
  );
}

function ProductCard({ product: p, onClose, onScanAgain }: { product: Product; onClose: () => void; onScanAgain?: () => void }) {
  const { can } = useAuth();
  const branches = p.branchStock ?? [];
  const batches = p.batches ?? [];
  const showBranch = new Set(batches.map((b) => b.branchId)).size > 1;
  const low = n(p.reorderLevel) > 0 && n(p.stock) <= n(p.reorderLevel);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Scanned Product"
      footer={
        <>
          {onScanAgain && (
            <Button variant="secondary" icon={<ScanLine className="size-4" />} onClick={onScanAgain}>
              Scan Another
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {/* Billing staff can scan without holding Products, so only offer the page to those who can open it */}
          {can("products.view") && (
            <Link
              href={`/products/${p.id}`}
              onClick={onClose}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-forest-700"
            >
              <ExternalLink className="size-4" /> Open Product
            </Link>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-slate-900">{p.name}</h4>
            {!p.isActive && <Badge tone="red">Inactive</Badge>}
            {p.isSubsidised && <Badge tone="amber">Subsidised</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {[p.brand, p.packSize, p.category?.name, p.subCategory?.name].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              SKU <span className="font-mono text-slate-700">{p.sku}</span>
            </span>
            {p.barcode && (
              <span>
                Barcode <span className="font-mono text-slate-700">{p.barcode}</span>
              </span>
            )}
            {p.hsnCode && (
              <span>
                HSN <span className="font-mono text-slate-700">{p.hsnCode}</span>
              </span>
            )}
            {p.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" /> {p.location}
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="In Stock" value={`${qty(p.stock)} ${p.unit}`} tone={n(p.stock) <= 0 ? "red" : low ? "amber" : "green"} note={p.totalStock !== undefined && n(p.totalStock) !== n(p.stock) ? `${qty(p.totalStock)} in all branches` : low ? "At or below reorder level" : undefined} />
          <Tile label="Sale Price" value={inr(p.salePrice)} />
          <Tile label="MRP" value={inr(p.mrp)} />
          <Tile label="GST" value={`${n(p.gstRate)}%`} />
        </div>

        {branches.length > 1 && (
          <section>
            <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Stock by Branch</h5>
            <div className="flex flex-wrap gap-1.5">
              {branches.map((b) => (
                <span key={b.branchId} className={cx("rounded-full px-2.5 py-1 text-xs", b.quantity > 0 ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-500")}>
                  {b.name} <span className="num font-semibold">{qty(b.quantity)}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Batches in Stock</h5>
          {batches.length === 0 ? (
            <p className="text-sm text-slate-500">No stock on hand{p.trackBatch ? "" : " (this product is not tracked by batch)"}.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Batch</th>
                    <th className="px-3 py-2 font-medium">Expiry</th>
                    {showBranch && <th className="px-3 py-2 font-medium">Branch</th>}
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{b.batchNo}</td>
                      <td className="px-3 py-2">
                        <ExpiryBadge expiry={b.expiryDate} />
                      </td>
                      {showBranch && <td className="px-3 py-2 text-slate-600">{b.branch?.name ?? "—"}</td>}
                      <td className="num px-3 py-2 text-right font-medium text-slate-800">{qty(b.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "green" | "amber" | "red" }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx("num mt-0.5 text-base font-semibold", tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-brand-700" : "text-slate-900")}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}
