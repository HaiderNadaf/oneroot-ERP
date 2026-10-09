const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrShortFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** ₹1,23,456.50 */
export const inr = (v: unknown) => inrFmt.format(n(v));

/** ₹1,23,457 (no paise) */
export const inr0 = (v: unknown) => inrShortFmt.format(n(v));

/** ₹1.2L / ₹3.4Cr for compact tiles and chart axes */
export function inrCompact(v: unknown) {
  const x = n(v);
  const abs = Math.abs(x);
  if (abs >= 1e7) return `₹${(x / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(x / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(x / 1e3).toFixed(1)}K`;
  return `₹${x.toFixed(0)}`;
}

export const qty = (v: unknown) => numFmt.format(n(v));

export function date(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Local YYYY-MM-DD, for <input type="date"> and API filters */
export const today = (d = new Date()) => d.toLocaleDateString("en-CA");

export const monthStart = () => {
  const d = new Date();
  return today(new Date(d.getFullYear(), d.getMonth(), 1));
};

export function daysUntil(v: string | Date | null | undefined) {
  if (!v) return null;
  const ms = new Date(v).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Indian-style amount in words for invoices: "Rupees Twelve Thousand Six Hundred Only" */
export function amountInWords(amount: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]} ${ones[x % 10]}`.trim());
  const three = (x: number) =>
    x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred ${two(x % 100)}`.trim() : two(x);

  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  let words = `Rupees ${parts.join(" ")}`;
  if (paise) words += ` and ${two(paise)} Paise`;
  return `${words} Only`;
}

/** Download rows as a CSV file */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
