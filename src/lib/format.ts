const nf0 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function kcal(n: number): string {
  return nf0.format(Math.round(n));
}

export function num(n: number | null | undefined, digits: 0 | 1 = 1): string {
  if (n == null || Number.isNaN(n)) return "–";
  return (digits === 0 ? nf0 : nf1).format(n);
}

export function signed(n: number, digits: 0 | 1 = 0): string {
  const s = num(Math.abs(n), digits);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

/** Parse an optional numeric form field; empty -> null. Accepts "," as decimal separator. */
export function parseNum(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
