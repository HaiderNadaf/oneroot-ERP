"use client";

import { Download, FileUp, Upload } from "lucide-react";
import type { Workbook } from "exceljs";
import Link from "next/link";
import { useRef, useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { Badge, Button, Card, Checkbox, PageHeader, Table, Td, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseCsv, type ParsedCsv } from "@/lib/csv";
import { downloadWorkbook, readSheet } from "@/lib/excel";
import { useApi } from "@/lib/hooks";
import { GST_RATES, UNITS, type Category } from "@/lib/types";

/** Columns the importer understands, in template order; the first alias is the template header */
const COLUMNS: { key: string; aliases: string[]; hint: string; required?: boolean; width?: number }[] = [
  { key: "category", aliases: ["Category", "category name", "category code", "main category"], hint: "name or code from the Categories sheet", required: true, width: 20 },
  { key: "subCategory", aliases: ["Sub-Category", "subcategory", "sub category", "sub-category name", "sub-category code"], hint: "a sub-category of that category", required: true, width: 30 },
  { key: "name", aliases: ["Product Name", "name", "product", "item"], hint: "Roundup 5 L", required: true, width: 28 },
  { key: "brand", aliases: ["Brand", "model", "brand/model"], hint: "", width: 16 },
  { key: "manufacturer", aliases: ["Manufacturer", "company"], hint: "", width: 18 },
  { key: "technicalName", aliases: ["Technical Name", "technical_name", "composition", "active ingredient"], hint: "Glyphosate 41% SL", width: 22 },
  { key: "packSize", aliases: ["Pack Size", "pack_size", "pack", "size", "capacity"], hint: "5 L, 50 kg bag", width: 12 },
  { key: "unit", aliases: ["Unit", "uom"], hint: "NOS, LTR, KG, GM, PKT, BAG…", width: 9 },
  { key: "hsnCode", aliases: ["HSN Code", "hsn", "hsn_code"], hint: "3808", width: 10 },
  { key: "gstRate", aliases: ["GST %", "gst", "gst rate", "gst_rate", "tax"], hint: "0 / 5 / 12 / 18 / 28", width: 8 },
  { key: "purchasePrice", aliases: ["Purchase Price", "purchase_price", "cost", "cost price"], hint: "excl. GST", width: 13 },
  { key: "salePrice", aliases: ["Selling Price", "sale price", "sale_price", "price", "rate"], hint: "incl. GST", required: true, width: 12 },
  { key: "mrp", aliases: ["MRP"], hint: "", width: 10 },
  { key: "reorderLevel", aliases: ["Reorder Level", "reorder_level", "min stock", "reorder"], hint: "alert at this stock", width: 12 },
  { key: "barcode", aliases: ["Barcode", "ean", "upc"], hint: "from the pack", width: 16 },
  { key: "location", aliases: ["Location", "rack", "bin", "shelf"], hint: "Rack A3", width: 12 },
  { key: "trackBatch", aliases: ["Track Batch", "track_batch", "batches"], hint: "yes / no", width: 11 },
  { key: "trackSerial", aliases: ["Track Serial", "track_serial", "serial"], hint: "yes / no (machinery)", width: 11 },
  { key: "isSubsidised", aliases: ["Govt Subsidised", "subsidised", "subsidized", "is_subsidised"], hint: "yes / no (fertiliser)", width: 14 },
  { key: "description", aliases: ["Notes", "description", "remarks"], hint: "", width: 24 },
  { key: "openingQty", aliases: ["Opening Qty", "opening_qty", "opening stock", "stock", "qty", "quantity"], hint: "goes into the selected branch", width: 11 },
  { key: "batchNo", aliases: ["Batch No", "batch", "batch_no", "lot"], hint: "for opening stock", width: 12 },
  { key: "expiryDate", aliases: ["Expiry Date", "expiry", "expiry_date", "exp"], hint: "YYYY-MM-DD", width: 12 },
  { key: "unitCost", aliases: ["Unit Cost", "unit_cost", "opening cost"], hint: "cost of opening stock", width: 10 },
  { key: "sku", aliases: ["SKU", "item code"], hint: "only to update an existing product — leave blank, new SKUs are generated", width: 18 },
];

type RowResult = { line: number; action: "create" | "update" | "skip" | "error"; sku?: string; name?: string; errors: string[]; warnings: string[] };
type ImportResult = { rows: RowResult[]; created: number; updated: number; skipped: number; errors: number; committed: boolean };

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");

export default function ImportPage() {
  const { can } = useAuth();
  if (!can("products.manage")) {
    return <p className="mx-auto mt-20 max-w-md text-center text-sm text-slate-500">You don&apos;t have access to this page. Ask an administrator for the &quot;Add, edit and delete products&quot; permission.</p>;
  }
  return <Importer />;
}

function Importer() {
  const toast = useToast();
  const needBranch = useNeedBranch("put opening stock in it");
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useApi<Category[]>("/categories", { withSubs: "true" });
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [unmapped, setUnmapped] = useState<string[]>([]);

  async function loadFile(file: File) {
    let sheet: ParsedCsv;
    try {
      sheet = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : await readSheet(file, "Products");
    } catch {
      return toast.error("Couldn't read that file — upload an Excel .xlsx or a .csv");
    }
    {
      const { headers: hs, rows: rs } = sheet;
      if (!hs.length || !rs.length) return toast.error("The file has no rows");
      // Map each header to a known column; "attr:xyz" (or a category field label) becomes an attribute
      const fieldLabels = new Map<string, string>();
      for (const c of (categories ?? []).flatMap((t) => t.subCategories ?? [])) {
        for (const f of c.fields ?? []) {
          fieldLabels.set(norm(f.label), f.key);
          fieldLabels.set(norm(f.key), f.key);
        }
      }
      const map: { col: string | null; attr: string | null }[] = hs.map((h) => {
        const nh = norm(h);
        const col = COLUMNS.find((c) => c.aliases.some((a) => norm(a) === nh));
        if (col) return { col: col.key, attr: null };
        const m = /^attr[:.]\s*(.+)$/i.exec(h.trim());
        if (m) return { col: null, attr: fieldLabels.get(norm(m[1])) ?? norm(m[1]).replace(/ /g, "_") };
        if (fieldLabels.has(nh)) return { col: null, attr: fieldLabels.get(nh)! };
        return { col: null, attr: null };
      });
      setUnmapped(hs.filter((_, i) => !map[i].col && !map[i].attr));
      const parsed = rs.map((r, idx) => {
        const o: Record<string, unknown> = { line: idx + 2 };
        const attrs: Record<string, string> = {};
        r.forEach((cell, i) => {
          const v = cell.trim();
          if (!v || !map[i]) return;
          if (map[i].col) o[map[i].col!] = v;
          else if (map[i].attr) attrs[map[i].attr!] = v;
        });
        if (Object.keys(attrs).length) o.attributes = attrs;
        return o;
      });
      setHeaders(hs);
      setRows(parsed);
      setResult(null);
      setFileName(file.name);
    }
  }

  async function run(commit: boolean) {
    if (!rows.length) return;
    setBusy(true);
    try {
      const r = await api.post<ImportResult>("/products/import", { rows, commit, updateExisting });
      setResult(r);
      if (commit) toast.success(`Imported: ${r.created} new, ${r.updated} updated${r.errors ? `, ${r.errors} with errors` : ""}`);
      else if (r.errors) toast.error(`${r.errors} row${r.errors === 1 ? "" : "s"} need fixing before import`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  /** Excel template: one column per field, a Categories sheet with every code, and dropdowns where the values are fixed */
  function template() {
    const tops = categories ?? [];
    const subsOf = (id: string) => tops.find((t) => t.id === id)?.subCategories ?? [];
    const pick = (cat: string, sub: string) => {
      const top = tops.find((t) => t.name === cat) ?? tops[0];
      const child = top ? (subsOf(top.id).find((x) => x.name === sub) ?? subsOf(top.id)[0]) : undefined;
      return [top?.name ?? "", child?.name ?? ""];
    };
    // Same product in three pack sizes = three sellable variants, each with its own SKU
    const sample: Record<string, string | number>[] = [
      ...["5 L", "10 L", "15 L"].map((size, i) => ({
        ...Object.fromEntries(["category", "subCategory"].map((k, x) => [k, pick("Crop Protection Chemicals", "Herbicides")[x]])),
        name: `Roundup ${size}`,
        brand: "Roundup",
        manufacturer: "Bayer",
        technicalName: "Glyphosate 41% SL",
        packSize: size,
        unit: "LTR",
        hsnCode: "3808",
        gstRate: 18,
        purchasePrice: [1900, 3700, 5400][i],
        salePrice: [2450, 4800, 7000][i],
        mrp: [2600, 5000, 7300][i],
        reorderLevel: 5,
        trackBatch: "yes",
        trackSerial: "no",
        isSubsidised: "no",
      })),
      {
        ...Object.fromEntries(["category", "subCategory"].map((k, x) => [k, pick("Fertilizers", "Chemical Fertilizers")[x]])),
        name: "Urea 45 kg",
        brand: "IFFCO",
        manufacturer: "IFFCO",
        technicalName: "Urea 46% N",
        packSize: "45 kg bag",
        unit: "BAG",
        hsnCode: "3102",
        gstRate: 5,
        purchasePrice: 242,
        salePrice: 266.5,
        mrp: 266.5,
        reorderLevel: 20,
        trackBatch: "yes",
        trackSerial: "no",
        isSubsidised: "yes",
        openingQty: 100,
        unitCost: 242,
      },
      {
        ...Object.fromEntries(["category", "subCategory"].map((k, x) => [k, pick("Farm Machinery", "Spraying & Crop Protection Equipment")[x]])),
        name: "Battery Sprayer 16 L",
        brand: "Neptune",
        manufacturer: "Neptune",
        packSize: "16 L",
        unit: "NOS",
        hsnCode: "8424",
        gstRate: 12,
        purchasePrice: 2400,
        salePrice: 2999,
        mrp: 3200,
        reorderLevel: 2,
        trackBatch: "no",
        trackSerial: "yes",
        isSubsidised: "no",
      },
    ];

    void downloadWorkbook("oneroot-products-template.xlsx", (wb: Workbook) => {
      const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = COLUMNS.map((c) => ({ header: c.aliases[0], key: c.key, width: c.width ?? 14 }));
      const head = ws.getRow(1);
      head.height = 22;
      COLUMNS.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.font = { bold: true, color: { argb: c.required ? "FFFFE08A" : "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5631" } };
        cell.alignment = { vertical: "middle" };
        cell.note = `${c.required ? "Required. " : ""}${c.hint}`.trim() || c.aliases[0];
      });
      sample.forEach((r) => ws.addRow(r));

      // Lists behind the dropdowns
      const lists = wb.addWorksheet("Lists", { state: "hidden" });
      tops.forEach((t, i) => (lists.getCell(i + 1, 1).value = t.name));
      UNITS.forEach((u, i) => (lists.getCell(i + 1, 2).value = u));
      GST_RATES.forEach((g, i) => (lists.getCell(i + 1, 3).value = g));
      ["yes", "no"].forEach((y, i) => (lists.getCell(i + 1, 4).value = y));
      const col = (key: string) => COLUMNS.findIndex((c) => c.key === key) + 1;
      const validate = (key: string, range: string) => {
        for (let r = 2; r <= 1000; r++) {
          ws.getCell(r, col(key)).dataValidation = { type: "list", allowBlank: true, formulae: [range] };
        }
      };
      if (tops.length) validate("category", `Lists!$A$1:$A$${tops.length}`);
      validate("unit", `Lists!$B$1:$B$${UNITS.length}`);
      validate("gstRate", `Lists!$C$1:$C$${GST_RATES.length}`);
      for (const k of ["trackBatch", "trackSerial", "isSubsidised"]) validate(k, "Lists!$D$1:$D$2");

      // Every category / sub-category with its code and where its SKUs start
      const ref = wb.addWorksheet("Categories", { views: [{ state: "frozen", ySplit: 1 }] });
      ref.columns = [
        { header: "Category", key: "cat", width: 20 },
        { header: "Category code", key: "catCode", width: 14 },
        { header: "Sub-Category", key: "sub", width: 40 },
        { header: "Sub-category code", key: "subCode", width: 17 },
        { header: "SKUs start at", key: "sku", width: 18 },
      ];
      ref.getRow(1).font = { bold: true };
      for (const t of tops) {
        for (const c of subsOf(t.id)) {
          const width = 11 - (t.code ?? "").length - (c.code ?? "").length;
          ref.addRow({ cat: t.name, catCode: t.code, sub: c.name, subCode: c.code, sku: t.code && c.code ? `ORI${t.code}${c.code}${"1".padStart(width, "0")}` : "" });
        }
      }
    });
  }

  const ok = result ? result.rows.filter((r) => r.action !== "error").length : 0;

  return (
    <>
      <PageHeader
        title="Import products"
        subtitle="Upload the Excel template (or a CSV) — one product per row, one field per column. Every new product gets its own ORI SKU; rows with an existing SKU or barcode update that product."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={template}>
              Download template
            </Button>
            <Link href="/products">
              <Button variant="secondary">Back to products</Button>
            </Link>
          </>
        }
      />
      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card title="1 · File">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void loadFile(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600 hover:border-brand-500 hover:bg-brand-50/40"
          >
            <FileUp className="size-6 text-slate-400" />
            {fileName ? (
              <span>
                <b>{fileName}</b> · {rows.length} rows
              </span>
            ) : (
              <span>Drop an Excel (.xlsx) or CSV file here, or click to choose</span>
            )}
          </button>
          {unmapped.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              Ignored columns: {unmapped.join(", ")}. Name a column <b>attr:Variety</b> (or exactly as a category field) to import it as a product field.
            </p>
          )}
          <div className="mt-4 space-y-2">
            <Checkbox label="Update products that already exist (matched by SKU or barcode)" checked={updateExisting} onChange={setUpdateExisting} />
            <p className="text-xs text-slate-500">Opening stock is only added to new products, into the selected branch.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" disabled={!rows.length} loading={busy && !result?.committed} onClick={() => run(false)}>
              Check
            </Button>
            <Button
              icon={<Upload className="size-4" />}
              disabled={!rows.length || !result || result.committed || result.errors === result.rows.length || needBranch.blocked}
              loading={busy}
              onClick={() => run(true)}
            >
              Import {result && !result.committed ? `${ok} row${ok === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-700">Columns understood</summary>
            <ul className="mt-2 space-y-0.5">
              {COLUMNS.map((c) => (
                <li key={c.key}>
                  <b className="font-mono">{c.aliases[0]}</b>
                  {c.required ? " *" : ""}
                  {c.hint ? ` — ${c.hint}` : ""}
                </li>
              ))}
              <li>
                <b className="font-mono">attr:&lt;field&gt;</b> — any category field, e.g. attr:Variety
              </li>
            </ul>
          </details>
        </Card>

        <Card title={result ? (result.committed ? "3 · Done" : "2 · Check") : "2 · Preview"} bodyClassName="p-0">
          {!rows.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Choose a file to see its rows here</p>
          ) : (
            <>
              {result && (
                <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2 text-xs">
                  <Badge tone="green">{result.created} new</Badge>
                  <Badge tone="blue">
                    {result.updated} update{result.updated === 1 ? "" : "s"}
                  </Badge>
                  <Badge>{result.skipped} skipped</Badge>
                  <Badge tone={result.errors ? "red" : "slate"}>
                    {result.errors} error{result.errors === 1 ? "" : "s"}
                  </Badge>
                  {result.committed && <span className="text-brand-700">Imported.</span>}
                </div>
              )}
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Line</Th>
                      <Th>Name</Th>
                      <Th>Category › Sub-category</Th>
                      <Th>SKU</Th>
                      <Th right>Price</Th>
                      <Th right>Opening</Th>
                      <Th>Result</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const res = result?.rows[i];
                      return (
                        <tr key={i} className={cx(res?.action === "error" && "bg-red-50/60")}>
                          <Td className="text-xs text-slate-400">{String(r.line)}</Td>
                          <Td className="font-medium">{String(r.name ?? "")}</Td>
                          <Td className="text-xs text-slate-600">{[r.category, r.subCategory].filter(Boolean).map(String).join(" › ")}</Td>
                          <Td className="whitespace-nowrap font-mono text-xs">
                            {res?.sku ?? String(r.sku ?? "")}
                            {res?.sku && res.action === "create" && !result?.committed && <span className="ml-1 font-sans text-slate-400">(next free)</span>}
                          </Td>
                          <Td right className="num">
                            {String(r.salePrice ?? "")}
                          </Td>
                          <Td right className="num">
                            {String(r.openingQty ?? "")}
                          </Td>
                          <Td className="text-xs">
                            {res ? (
                              <>
                                {res.action === "create" && <Badge tone="green">{result?.committed ? "Created" : "Will create"}</Badge>}
                                {res.action === "update" && <Badge tone="blue">{result?.committed ? "Updated" : "Will update"}</Badge>}
                                {res.action === "skip" && <Badge>Exists · skipped</Badge>}
                                {res.action === "error" && <Badge tone="red">Error</Badge>}
                                {res.errors.map((e, k) => (
                                  <p key={k} className="text-red-700">
                                    {e}
                                  </p>
                                ))}
                                {res.warnings.map((w, k) => (
                                  <p key={k} className="text-amber-700">
                                    {w}
                                  </p>
                                ))}
                              </>
                            ) : (
                              <span className="text-slate-400">Not checked yet</span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              <p className="px-4 py-2 text-xs text-slate-400">{headers.length} columns in the file</p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
