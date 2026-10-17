"use client";

/**
 * Lazy-loaded versions of heavy, rarely-opened parts of the app. Each one's code is downloaded only the first
 * time it is needed (a modal when it opens, the chart when the dashboard has data), which keeps the JavaScript
 * every page loads up front small. Import these instead of the components themselves.
 *
 * The modals all render nothing while closed, so `open && <…>` changes nothing about how they behave; it just
 * means their code isn't fetched until someone opens them.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { CameraScanner } from "./CameraScanner";
import type { CategoryManager } from "./CategoryManager";
import type { CustomerForm } from "./CustomerForm";
import type { LabelPrintModal } from "./LabelPrintModal";
import type { PoTermsModal } from "./PoTermsModal";
import type { ProductForm } from "./ProductForm";
import type { StockAdjustModal } from "./StockAdjustModal";
import type { TransferModal } from "./TransferModal";
import type { VendorForm } from "./VendorForm";
import { InfinityLoader } from "./ui";

// ssr: false — these only ever appear after a click in the signed-in app, never in the first HTML
const ProductFormLazy = dynamic(() => import("./ProductForm").then((m) => m.ProductForm), { ssr: false });
const CustomerFormLazy = dynamic(() => import("./CustomerForm").then((m) => m.CustomerForm), { ssr: false });
const VendorFormLazy = dynamic(() => import("./VendorForm").then((m) => m.VendorForm), { ssr: false });
const StockAdjustModalLazy = dynamic(() => import("./StockAdjustModal").then((m) => m.StockAdjustModal), { ssr: false });
const TransferModalLazy = dynamic(() => import("./TransferModal").then((m) => m.TransferModal), { ssr: false });
const CategoryManagerLazy = dynamic(() => import("./CategoryManager").then((m) => m.CategoryManager), { ssr: false });
const LabelPrintModalLazy = dynamic(() => import("./LabelPrintModal").then((m) => m.LabelPrintModal), { ssr: false });
const CameraScannerLazy = dynamic(() => import("./CameraScanner").then((m) => m.CameraScanner), { ssr: false });
const PoTermsModalLazy = dynamic(() => import("./PoTermsModal").then((m) => m.PoTermsModal), { ssr: false });

export const LazyProductForm = (p: ComponentProps<typeof ProductForm>) => (p.open ? <ProductFormLazy {...p} /> : null);
export const LazyCustomerForm = (p: ComponentProps<typeof CustomerForm>) => (p.open ? <CustomerFormLazy {...p} /> : null);
export const LazyVendorForm = (p: ComponentProps<typeof VendorForm>) => (p.open ? <VendorFormLazy {...p} /> : null);
export const LazyStockAdjustModal = (p: ComponentProps<typeof StockAdjustModal>) => (p.open ? <StockAdjustModalLazy {...p} /> : null);
export const LazyTransferModal = (p: ComponentProps<typeof TransferModal>) => (p.open ? <TransferModalLazy {...p} /> : null);
export const LazyCategoryManager = (p: ComponentProps<typeof CategoryManager>) => (p.open ? <CategoryManagerLazy {...p} /> : null);
export const LazyLabelPrintModal = (p: ComponentProps<typeof LabelPrintModal>) => (p.open ? <LabelPrintModalLazy {...p} /> : null);
export const LazyCameraScanner = (p: ComponentProps<typeof CameraScanner>) => (p.open ? <CameraScannerLazy {...p} /> : null);
export const LazyPoTermsModal = (p: ComponentProps<typeof PoTermsModal>) => (p.open ? <PoTermsModalLazy {...p} /> : null);

/** Dashboard bar chart; recharts loads after the rest of the dashboard, with a loader in its place meanwhile */
export const LazySalesPurchaseChart = dynamic(() => import("./SalesPurchaseChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <InfinityLoader className="size-10" />
    </div>
  ),
});
