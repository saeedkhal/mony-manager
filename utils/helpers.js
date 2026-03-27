export const getFiscalYear = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const m = d.getMonth();
  const y = d.getFullYear();
  const startYear = m >= 1 ? y : y - 1;
  return `${startYear}/${startYear + 1}`;
};

export const getCurrentFiscalYear = () => {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const sy = m >= 1 ? y : y - 1;
  return `${sy}/${sy + 1}`;
};

export const getFiscalYearLabel = (fy) => {
  if (fy == null || String(fy).trim() === "") return "";
  const [sy, ey] = String(fy).split("/").map(Number);
  if (!Number.isFinite(sy) || !Number.isFinite(ey)) return String(fy);
  return `فبراير ${sy} — يناير ${ey}`;
};

/** Start calendar year of fiscal period (e.g. 2026 for "2026/2027"), for chart buckets */
export const getStartYearFromFiscalLabel = (label) => {
  if (label == null) return new Date().getFullYear();
  const [sy] = String(label).split("/").map(Number);
  return Number.isFinite(sy) ? sy : new Date().getFullYear();
};

export const fmt = (n) =>
  Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
