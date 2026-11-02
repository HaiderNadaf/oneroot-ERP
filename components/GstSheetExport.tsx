"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { RangeBar, periodLabel, type Range } from "@/components/reports/ReportKit";
import { Button, Modal, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { today } from "@/lib/format";

/** po = approved purchase orders, grn = posted goods inward, sale = completed sales invoices */
export type GstSheetKind = "po" | "grn" | "sale";

/** One row of the GST Vouchers sheet (GET /accounting/tally/gst-sheet): a whole PO, GRN or sales bill */
interface GstSheetRow {
  date: string;
  invoiceNo: string;
  party: string;
  ledger: string;
  centralLedger: string;
  stateLedger: string;
  taxable: number;
  narration: string;
  gstRates: number[];
  gst: number;
  billAmount: number;
  placeOfSupply: string;
  type: string;
  products: string;
  hsn: string;
  itemCount: number;
  totalQty: number;
  charges: number;
  roundOff: number;
  batches: string;
  expiry: string;
  remarks: string;
}

type Column = { header: string; width: number; value: (r: GstSheetRow) => unknown; numFmt?: string };

const KIND_LABEL: Record<GstSheetKind, string> = { po: "approved purchase orders", grn: "GRNs", sale: "sales invoices" };

const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
const MONEY = "#,##0.00";

/** The usual Excel-to-Tally "GST Vouchers" columns in their order, then what is on the document */
function columns(kind: GstSheetKind): Column[] {
  return [
    { header: "DATE", width: 12, value: (r) => day(r.date), numFmt: "dd-mm-yyyy" },
    { header: "INVOICE NO.", width: 18, value: (r) => r.invoiceNo },
    { header: "CASH/PARTY", width: 28, value: (r) => r.party },
    { header: "PURCHASE/SALES LEDGER", width: 22, value: (r) => r.ledger },
    { header: "IGST/CENTRAL GST LEDGER", width: 22, value: (r) => r.centralLedger },
    { header: "UT/STATE GST LEDGER", width: 18, value: (r) => r.stateLedger },
    { header: "TAXABLE AMOUNT", width: 16, value: (r) => r.taxable, numFmt: MONEY },
    { header: "NARRATION", width: 44, value: (r) => r.narration },
    // One slab as a percentage (like the template); several as text, e.g. "5%, 18%"
    { header: "GST SLAB", width: 10, value: (r) => (r.gstRates.length === 1 ? r.gstRates[0] / 100 : r.gstRates.map((g) => `${g}%`).join(", ")), numFmt: "0%" },
    { header: "GST", width: 12, value: (r) => r.gst, numFmt: '#,##0.00;-#,##0.00;"-"' },
    { header: "BILL AMOUNT", width: 16, value: (r) => r.billAmount, numFmt: MONEY },
    { header: "PLACE OF SUPPLY", width: 16, value: (r) => r.placeOfSupply },
    { header: "TYPE", width: 15, value: (r) => r.type },
    { header: "PRODUCTS (QTY @ RATE EXCL. GST)", width: 70, value: (r) => r.products },
    { header: "HSN", width: 14, value: (r) => r.hsn },
    { header: "ITEMS", width: 7, value: (r) => r.itemCount },
    { header: kind === "po" ? "ORDERED QTY" : kind === "grn" ? "ACCEPTED QTY" : "TOTAL QTY", width: 12, value: (r) => r.totalQty, numFmt: "#,##0.###" },
    ...(kind === "po" ? [{ header: "FREIGHT / OTHER CHARGES", width: 14, value: (r: GstSheetRow) => r.charges, numFmt: '#,##0.00;-#,##0.00;"-"' }] : []),
    { header: "ROUND OFF", width: 10, value: (r) => r.roundOff, numFmt: '#,##0.00;-#,##0.00;"-"' },
    ...(kind === "po"
      ? []
      : [
          { header: "BATCH NOS.", width: 24, value: (r: GstSheetRow) => r.batches },
          { header: "EARLIEST EXPIRY", width: 13, value: (r: GstSheetRow) => day(r.expiry), numFmt: "dd-mm-yyyy" },
        ]),
    { header: "REMARKS", width: 40, value: (r) => r.remarks },
  ];
}

/** Fetches the rows and saves the .xlsx; false when the period has no documents */
export async function downloadGstSheet(kind: GstSheetKind, range: Range): Promise<boolean> {
  const rows = await api.get<GstSheetRow[]>("/accounting/tally/gst-sheet", { ...range, kind });
  if (!rows.length) return false;
  const cols = columns(kind);
  const { downloadWorkbook } = await import("@/lib/excel");
  await downloadWorkbook(`gst-vouchers-${kind}-${range.from}-to-${range.to}.xlsx`, (wb) => {
    const ws = wb.addWorksheet("GST Vouchers", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    const head = ws.getRow(1);
    head.height = 30;
    head.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC5D9F1" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    for (const r of rows) ws.addRow(cols.map((c) => c.value(r)));
  });
  return true;
}

/** Hook for a download button: runs the export and reports an empty period or an error as a toast */
export function useGstSheetDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState<GstSheetKind | null>(null);
  async function download(kind: GstSheetKind, range: Range) {
    setBusy(kind);
    try {
      const saved = await downloadGstSheet(kind, range);
      if (!saved) toast.error(`No ${KIND_LABEL[kind]} in ${periodLabel(range)}`);
      return saved;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, download };
}

/** "Tally Excel" button for a document list: picks a period (Today, Yesterday, This Week …) and downloads the sheet */
export function GstSheetButton({ kind }: { kind: GstSheetKind }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<Range>(() => ({ from: today(), to: today() }));
  const { busy, download } = useGstSheetDownload();

  return (
    <>
      <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => setOpen(true)}>
        Tally Excel
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Download GST Vouchers Excel"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              icon={<FileSpreadsheet className="size-4" />}
              loading={busy === kind}
              onClick={async () => {
                if (await download(kind, range)) setOpen(false);
              }}
            >
              Download .xlsx
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <RangeBar value={range} onChange={setRange} />
          <p className="text-sm text-slate-600">
            The {KIND_LABEL[kind]} dated {periodLabel(range)}, one row each: the Tally GST Vouchers columns (date, invoice no., party, ledgers, taxable amount, narration, GST slab,
            GST, bill amount, place of supply, type), then its products with quantity and rate{kind === "po" ? ", freight" : ", batches, expiry"} and round off.
          </p>
        </div>
      </Modal>
    </>
  );
}
