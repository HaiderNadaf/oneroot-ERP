// Excel (.xlsx) reader/writer for bulk imports and templates. exceljs is loaded only when needed.

import type { CellValue, Workbook, Worksheet } from "exceljs";
import type { ParsedCsv } from "./csv";

async function newWorkbook(): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  return new ExcelJS.Workbook();
}

/** Build a workbook with `build` and save it from the browser */
export async function downloadWorkbook(filename: string, build: (wb: Workbook) => void | Promise<void>) {
  const wb = await newWorkbook();
  wb.creator = "OneRoot ERP";
  wb.created = new Date();
  await build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pad = (v: number) => String(v).padStart(2, "0");

/** A cell as the text a CSV would hold: dates as YYYY-MM-DD, formulas as their result */
function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText((v.result ?? "") as CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
    return "";
  }
  return String(v);
}

/**
 * Read one sheet of an .xlsx file into the same shape as parseCsv: the first row is the header.
 * Uses the sheet named `sheetName` when there is one, else the first sheet. Blank rows are skipped.
 */
export async function readSheet(file: File, sheetName?: string): Promise<ParsedCsv> {
  const wb = await newWorkbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws: Worksheet | undefined = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const width = ws.columnCount;
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).trim());
    if (cells.some((x) => x !== "")) all.push(cells);
  });
  const headers = (all.shift() ?? []).map((h) => h.trim());
  // Drop trailing columns with no header so stray formatting doesn't add empty fields
  let last = headers.length;
  while (last > 0 && !headers[last - 1]) last--;
  return { headers: headers.slice(0, last), rows: all.map((r) => r.slice(0, last)) };
}
