// Barcode encoders for on-screen labels (SVG). EAN-13 for 13-digit retail codes, Code 128 B for everything else.

/** Code 128 bar/space width patterns, values 0–106 (106 = stop, with the trailing bar) */
const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export function ean13CheckDigit(d12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export const isEan13 = (s: string) => /^\d{13}$/.test(s) && ean13CheckDigit(s.slice(0, 12)) === s[12];

/** Code 128 B as a string of module bits ("1" = bar) */
function code128Bits(text: string) {
  const values = [104];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    values.push(code >= 32 && code <= 126 ? code - 32 : 0);
  }
  let check = values[0];
  for (let i = 1; i < values.length; i++) check += values[i] * i;
  values.push(check % 103, 106);
  let bits = "";
  for (const v of values) {
    const pattern = CODE128[v];
    for (let i = 0; i < pattern.length; i++) bits += (i % 2 === 0 ? "1" : "0").repeat(Number(pattern[i]));
  }
  return bits;
}

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function ean13Bits(code: string) {
  const parity = PARITY[Number(code[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += parity[i - 1] === "L" ? L[d] : G[d];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) {
    const d = Number(code[i]);
    bits += [...L[d]].map((b) => (b === "1" ? "0" : "1")).join("");
  }
  return bits + "101";
}

export interface BarcodeShape {
  /** "1" = bar module, "0" = space module */
  bits: string;
  kind: "EAN13" | "CODE128";
  /** Human-readable text under the bars */
  text: string;
}

export function encodeBarcode(value: string): BarcodeShape | null {
  const v = value.trim();
  if (!v) return null;
  if (isEan13(v)) return { bits: ean13Bits(v), kind: "EAN13", text: `${v[0]} ${v.slice(1, 7)} ${v.slice(7)}` };
  return { bits: code128Bits(v), kind: "CODE128", text: v };
}

/** Rectangles (x, width in modules) for an SVG */
export function barcodeRects(bits: string) {
  const rects: { x: number; w: number }[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let w = 0;
      while (bits[i + w] === "1") w++;
      rects.push({ x: i, w });
      i += w;
    } else i++;
  }
  return rects;
}
