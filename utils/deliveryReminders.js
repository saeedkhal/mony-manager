import { isValidDateYmd, trimmed } from "./formValidation";

export const DEFAULT_REMINDER_DAYS = 2;

export const REMINDER_DAY_OPTIONS = [
  { value: null, label: "بدون تنبيه" },
  { value: 0, label: "يوم التسليم" },
  { value: 1, label: "قبلها بيوم" },
  { value: 2, label: "قبلها بيومين" },
  { value: 3, label: "قبلها بـ 3 أيام" },
  { value: 7, label: "قبلها بأسبوع" },
];

export function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeDeliveryDate(val) {
  const s = trimmed(val);
  return isValidDateYmd(s) ? s : null;
}

export function normalizeReminderDays(val, deliveryDate) {
  if (!deliveryDate) return null;
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Calendar days from today to YYYY-MM-DD (negative = overdue). */
export function daysUntilYmd(ymd) {
  const date = normalizeDeliveryDate(ymd);
  if (!date) return null;
  const [y, m, d] = date.split("-").map((n) => Number(n));
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * @returns {null | { kind: 'overdue'|'today'|'soon'|'upcoming', days: number, date: string, label: string, color: string }}
 */
export function getDeliveryStatus(client) {
  const date = normalizeDeliveryDate(client?.deliveryDate);
  if (!date) return null;
  const days = daysUntilYmd(date);
  if (days == null) return null;
  if (days < 0) {
    const n = Math.abs(days);
    return {
      kind: "overdue",
      days,
      date,
      label: n === 1 ? "متأخر يوم" : `متأخر ${n} يوم`,
      color: "#f43f5e",
    };
  }
  if (days === 0) {
    return { kind: "today", days, date, label: "التسليم اليوم", color: "#f59e0b" };
  }
  return {
    kind: "upcoming",
    days,
    date,
    label: days === 1 ? "متبقي يوم" : `متبقي ${days} يوم`,
    color: "#818cf8",
  };
}

/** True when we should surface a reminder (overdue, today, or within reminderDays). Skips finished jobs. */
export function isDeliveryAlerting(client) {
  if (!client || client.status === "done") return false;
  const st = getDeliveryStatus(client);
  if (!st) return false;
  if (st.kind === "overdue" || st.kind === "today") return true;
  const remind = normalizeReminderDays(client.reminderDays, st.date);
  if (remind == null) return false;
  return st.days <= remind;
}

export function collectDeliveryAlerts(clients) {
  const rank = { overdue: 0, today: 1, soon: 2 };
  return (clients || [])
    .map((c) => {
      if (!isDeliveryAlerting(c)) return null;
      const st = getDeliveryStatus(c);
      const kind = st.kind === "upcoming" ? "soon" : st.kind;
      return { client: c, ...st, kind };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const r = rank[a.kind] - rank[b.kind];
      if (r !== 0) return r;
      return String(a.date).localeCompare(String(b.date));
    });
}
