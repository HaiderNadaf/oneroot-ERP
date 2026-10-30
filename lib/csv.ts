// Small CSV reader/writer for bulk imports and exports (RFC 4180: quotes, embedded commas and newlines)

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

// CSV writing is not used anywhere: exports go through lib/format (downloadCsv) and lib/excel
// const esc = (v: unknown) => {
//   const s = v === null || v === undefined ? "" : String(v);
//   return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
// };
//
// export function toCsv(headers: string[], rows: unknown[][]): string {
//   return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
// }
//
// /** Save text as a file from the browser */
// export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
//   const blob = new Blob(["﻿" + text], { type });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = filename;
//   a.click();
//   setTimeout(() => URL.revokeObjectURL(url), 1000);
// }
