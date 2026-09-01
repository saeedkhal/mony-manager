import { CURRENCY } from "../constants";
import { fmt } from "./helpers";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Egyptian / international phone → digits for wa.me (e.g. 2010…). */
export function toWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("20") && digits.length >= 11) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `20${digits.slice(1)}`;
  if (digits.length === 10) return `20${digits}`;
  return digits;
}

/**
 * Ledger rows: order (if any) then income payments oldest-first, with running remaining.
 */
export function buildClientPaymentStatement(client) {
  const orderAmount = Number(client?.orderAmount) > 0 ? Number(client.orderAmount) : 0;
  const payments = (client?.txs || [])
    .filter((t) => t.type === "income")
    .slice()
    .sort((a, b) => {
      const d = String(a.date || "").localeCompare(String(b.date || ""));
      if (d !== 0) return d;
      return Number(a.id) - Number(b.id);
    });
  const rows = [];
  let remaining = orderAmount;
  if (orderAmount > 0) {
    rows.push({
      kind: "order",
      date: client.createdAt || "—",
      label: "قيمة الطلبية",
      paid: 0,
      remaining,
    });
  }
  for (const p of payments) {
    remaining -= Number(p.amount) || 0;
    rows.push({
      kind: "payment",
      date: p.date || "—",
      label: p.cat || "دفعة",
      note: p.note || "",
      paid: Number(p.amount) || 0,
      remaining,
    });
  }
  const totalPaid = payments.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return {
    orderAmount,
    totalPaid,
    remaining: orderAmount > 0 ? orderAmount - totalPaid : null,
    rows,
    payments,
  };
}

export function clientStatementHtml(client, statement, fyLabel) {
  const name = escapeHtml(client?.name || "عميل");
  const phone = escapeHtml(client?.phone || "—");
  const project = escapeHtml(client?.project || "—");
  const fy = escapeHtml(fyLabel || "");
  const orderStr = statement.orderAmount > 0 ? `${fmt(statement.orderAmount)} ${CURRENCY}` : "—";
  const paidStr = `${fmt(statement.totalPaid)} ${CURRENCY}`;
  const remainStr =
    statement.remaining == null ? "—" : `${fmt(statement.remaining)} ${CURRENCY}`;
  const bodyRows = (statement.rows || [])
    .map((r) => {
      const paidCell = r.kind === "order" ? "—" : fmt(r.paid);
      const remainCell = statement.orderAmount > 0 ? fmt(r.remaining) : "—";
      const note = r.note ? `<div style="color:#64748b;font-size:11px;margin-top:2px">${escapeHtml(r.note)}</div>` : "";
      return `<tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.label)}${note}</td>
        <td>${paidCell}</td>
        <td>${remainCell}</td>
      </tr>`;
    })
    .join("");
  const empty = `<tr><td colspan="4" style="text-align:center;color:#64748b">لا توجد دفعات بعد</td></tr>`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>كشف حساب — ${name}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; direction: rtl; color: #0f172a; padding: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { color: #475569; font-size: 13px; margin-bottom: 16px; line-height: 1.7; }
    .sum td { border: 1px solid #cbd5e1; border-radius: 0; padding: 10px 12px; width: 33%; }
    .sum b { display: block; color: #64748b; font-size: 11px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #e2e8f0; padding: 8px; text-align: right; }
    td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: right; }
    .foot { margin-top: 16px; font-size: 15px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>كشف حساب عميل</h1>
  <div class="meta">
    الاسم: ${name}<br/>
    التليفون: ${phone}<br/>
    المشروع: ${project}${fy ? `<br/>السنة المالية: ${fy}` : ""}
  </div>
  <table class="sum">
    <tr>
      <td><b>قيمة الطلبية</b>${orderStr}</td>
      <td><b>إجمالي المدفوع</b>${paidStr}</td>
      <td><b>المتبقي</b>${remainStr}</td>
    </tr>
  </table>
  <table>
    <thead>
      <tr><th>التاريخ</th><th>البيان</th><th>المدفوع</th><th>المتبقي</th></tr>
    </thead>
    <tbody>
      ${bodyRows || empty}
    </tbody>
  </table>
  <p class="foot">المتبقي: ${remainStr}</p>
</body>
</html>`;
}
