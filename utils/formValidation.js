/** Arabic messages for inline form validation */
export const FORM_MSG = {
  required: "هذا الحقل مطلوب",
  amount: "أدخل مبلغاً صالحاً أكبر من صفر",
  date: "اختر أو أدخل تاريخاً صالحاً",
  client: "اختر العميل",
  worker: "اختر الصنايعي",
  supplier: "اختر المورد",
};

export function trimmed(v) {
  return (v == null ? "" : String(v)).trim();
}

/** @returns {number | null} */
export function parsePositiveAmount(amount) {
  const n = Number(amount);
  if (amount === "" || amount == null || Number.isNaN(n) || n <= 0) return null;
  return n;
}

export function isValidDateYmd(val) {
  const s = trimmed(val);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
