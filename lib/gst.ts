/** GST state codes — the first two digits of every GSTIN */
export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check character (15th) computed from the first 14 */
function checkChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export interface GstinInfo {
  /** Empty input */
  empty: boolean;
  /** Length, state code and pattern are right (safe to save) */
  valid: boolean;
  /** Why it can't be saved */
  error?: string;
  /** Saveable but suspicious: the check digit doesn't match (usually a typo) */
  warning?: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
}

export function parseGstin(raw?: string | null): GstinInfo {
  const g = (raw ?? "").trim().toUpperCase();
  if (!g) return { empty: true, valid: false };
  const code = g.slice(0, 2);
  const stateName = GST_STATES[code];
  const base = { empty: false, stateCode: stateName ? code : undefined, stateName };
  if (g.length !== 15) return { ...base, valid: false, error: `GSTIN has 15 characters (${g.length} entered)` };
  if (!stateName) return { ...base, valid: false, error: `"${code}" is not a GST state code` };
  if (!GSTIN_FORMAT.test(g)) return { ...base, valid: false, error: "Format should be like 33ABCDE1234F1Z5" };
  const warning = checkChar(g.slice(0, 14)) !== g[14] ? "Check digit doesn't match — please re-check for a typo" : undefined;
  return { ...base, valid: true, warning, pan: g.slice(2, 12) };
}

/** State code from a GSTIN or a typed state name */
export function stateCodeOf(party: { gstin?: string | null; state?: string | null; stateCode?: string | null }) {
  if (party.stateCode && GST_STATES[party.stateCode]) return party.stateCode;
  // Only trust the GSTIN's first two digits when the whole GSTIN is well-formed
  const fromGstin = parseGstin(party.gstin);
  if (fromGstin.valid && fromGstin.stateCode) return fromGstin.stateCode;
  const name = party.state?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name) return undefined;
  return Object.entries(GST_STATES).find(([, n]) => n.toLowerCase() === name)?.[0];
}

export interface PlaceOfSupply {
  code?: string;
  name?: string;
  /** null = can't tell (missing GSTIN/state on either side) */
  interState: boolean | null;
  /** e.g. "Telangana · IGST" */
  label: string;
  taxType: "IGST" | "CGST + SGST" | null;
}

/**
 * Place of supply for a party vs our store: a different state means IGST,
 * the same state means CGST + SGST.
 */
export function placeOfSupply(
  party: { gstin?: string | null; state?: string | null } | null | undefined,
  store: { gstin?: string | null; state?: string | null; stateCode?: string | null } | null | undefined,
): PlaceOfSupply {
  const code = party ? stateCodeOf(party) : undefined;
  const storeCode = store ? stateCodeOf(store) : undefined;
  const name = code ? GST_STATES[code] : party?.state?.trim() || undefined;
  const interState = code && storeCode ? code !== storeCode : null;
  const taxType = interState === null ? null : interState ? "IGST" : "CGST + SGST";
  return { code, name, interState, taxType, label: name ? (taxType ? `${name} · ${taxType}` : name) : "—" };
}
