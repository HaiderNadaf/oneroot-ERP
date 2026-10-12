"use client";

import { Download, FileUp, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { Badge, Button, Card, Checkbox, PageHeader, Table, Td, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadText, parseCsv, toCsv } from "@/lib/csv";
import { useApi } from "@/lib/hooks";
import type { Category } from "@/lib/types";

/** Columns the importer understands; the first alias is the template header */
const COLUMNS: { key: string; aliases: string[]; hint: string; required?: boolean }[] = [
  { key: "name", aliases: ["name", "product", "product name", "item"], hint: "Urea 45 kg", required: true },
  { key: "sku", aliases: ["sku", "code", "item code"], hint: "blank = automatic" },
  { key: "barcode", aliases: ["barcode", "ean", "upc"], hint: "from the pack" },
  { key: "type", aliases: ["type", "product type"], hint: "SEED / FERTILIZER / PESTICIDE / EQUIPMENT / OTHER" },
  { key: "category", aliases: ["category", "category name", "category code"], hint: "name or SKU code of an existing category" },
  { key: "brand", aliases: ["brand"], hint: "" },
  { key: "manufacturer", aliases: ["manufacturer", "company"], hint: "" },
  { key: "technicalName", aliases: ["technical name", "technical_name", "composition", "active ingredient"], hint: "Imidacloprid 17.8% SL" },
  { key: "hsnCode", aliases: ["hsn", "hsn code", "hsn_code"], hint: "3105" },
  { key: "gstRate", aliases: ["gst", "gst %", "gst rate", "gst_rate", "tax"], hint: "0 / 5 / 12 / 18 / 28" },
  { key: "unit", aliases: ["unit", "uom"], hint: "BAG, KG, LTR, PKT, NOS…" },
  { key: "packSize", aliases: ["pack size", "pack_size", "pack", "size"], hint: "50 kg bag" },
  { key: "mrp", aliases: ["mrp"], hint: "" },
  { key: "salePrice", aliases: ["sale price", "sale_price", "selling price", "price", "rate"], hint: "incl. GST", required: true },
  { key: "purchasePrice", aliases: ["purchase price", "purchase_price", "cost", "cost price"], hint: "excl. GST" },
  { key: "reorderLevel", aliases: ["reorder level", "reorder_level", "min stock", "reorder"], hint: "" },
  { key: "trackBatch", aliases: ["track batch", "track_batch", "batches"], hint: "yes / no" },
  { key: "isSubsidised", aliases: ["subsidised", "subsidized", "is_subsidised", "govt subsidised"], hint: "yes / no" },
  { key: "trackSerial", aliases: ["track serial", "track_serial", "serial"], hint: "yes / no (equipment)" },
  { key: "location", aliases: ["location", "rack", "bin", "shelf"], hint: "Rack A3" },
  { key: "openingQty", aliases: ["opening qty", "opening_qty", "opening stock", "stock", "qty", "quantity"], hint: "goes into the selected branch" },
  { key: "batchNo", aliases: ["batch", "batch no", "batch_no", "lot"], hint: "for opening stock" },
  { key: "expiryDate", aliases: ["expiry", "expiry date", "expiry_date", "exp"], hint: "YYYY-MM-DD" },
  { key: "unitCost", aliases: ["unit cost", "unit_cost", "opening cost"], hint: "cost of opening stock" },
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
  const { data: categories } = useApi<Category[]>("/categories");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [unmapped, setUnmapped] = useState<string[]>([]);

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const { headers: hs, rows: rs } = parseCsv(String(reader.result ?? ""));
      if (!hs.length || !rs.length) return toast.error("The file has no rows");
      // Map each header to a known column; "attr:xyz" (or a category field label) becomes an attribute
      const fieldLabels = new Map<string, string>();
      for (const c of categories ?? []) {
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
    };
    reader.readAsText(file);
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

  function template() {
    const hs = COLUMNS.map((c) => c.aliases[0]);
    const sample = [
      ["Urea 45 kg", "", "", "FERTILIZER", "Fertilizers", "IFFCO", "IFFCO", "Urea 46% N", "3102", "5", "BAG", "45 kg bag", "266.50", "266.50", "242", "20", "yes", "yes", "no", "Rack A1", "100", "", "", "242"],
      ["Mancozeb 75% WP 1 kg", "", "", "PESTICIDE", "Pesticides", "Indofil", "Indofil", "Mancozeb 75% WP", "3808", "18", "PKT", "1 kg", "420", "400", "300", "10", "yes", "no", "no", "Rack B2", "24", "MZ2601", "2028-03-31", "300"],
      ["Battery sprayer 16 L", "", "", "EQUIPMENT", "Equipment & Tools", "Neptune", "Neptune", "", "8424", "12", "NOS", "16 L", "3200", "2999", "2400", "2", "no", "no", "yes", "Store room", "3", "", "", "2400"],
    ];
    downloadText("oneroot-products-template.csv", toCsv(hs, sample));
  }

  const ok = result ? result.rows.filter((r) => r.action !== "error").length : 0;

  return (
    <>
      <PageHeader
        title="Import products"
        subtitle="Upload a CSV (from Excel: Save as → CSV UTF-8). Rows are matched to existing products by SKU or barcode; the rest are created."
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
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
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
              if (f) loadFile(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-600 hover:border-brand-500 hover:bg-brand-50/40"
          >
            <FileUp className="size-6 text-slate-400" />
            {fileName ? (
              <span>
                <b>{fileName}</b> · {rows.length} rows
              </span>
            ) : (
              <span>Drop a CSV here or click to choose</span>
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
                      <Th>SKU</Th>
                      <Th>Type</Th>
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
                          <Td className="font-mono text-xs">{res?.sku ?? String(r.sku ?? "")}</Td>
                          <Td className="text-xs">{String(r.type ?? "")}</Td>
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
