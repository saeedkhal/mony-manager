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
  const [sy, ey] = fy.split("/").map(Number);
  return `فبراير ${sy} — يناير ${ey}`;
};

export const fmt = (n) =>
  Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
