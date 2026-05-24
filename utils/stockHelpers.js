import { STOCK_UNITS } from "../constants";

/** @typedef {{ id: number, itemId: number, direction: 'in'|'out', quantity: number, unitPrice: number, supplierId?: number, clientId?: number, clientTxId?: number, note?: string, date: string, fiscalYearId?: number }} StockMovement */

export function getStockUnitLabel(unitId) {
  return STOCK_UNITS.find((u) => u.id === unitId)?.label || unitId || "";
}

/**
 * Weighted-average cost from movements (chronological).
 * @param {StockMovement[]} movements
 */
export function computeStockBalance(movements) {
  const sorted = [...movements].sort((a, b) => {
    const d = String(a.date || "").localeCompare(String(b.date || ""));
    if (d !== 0) return d;
    return Number(a.id) - Number(b.id);
  });
  let qty = 0;
  let totalCost = 0;
  for (const m of sorted) {
    const q = Number(m.quantity) || 0;
    if (q <= 0) continue;
    if (m.direction === "in") {
      totalCost += q * (Number(m.unitPrice) || 0);
      qty += q;
    } else if (m.direction === "out") {
      const avg = qty > 0 ? totalCost / qty : 0;
      const cost = avg * q;
      totalCost -= cost;
      qty -= q;
    }
  }
  const avgCost = qty > 0 ? totalCost / qty : 0;
  return { quantity: Math.max(0, qty), totalCost: Math.max(0, totalCost), avgCost };
}

/**
 * @param {StockMovement[]} movements
 * @param {number} issueQty
 */
export function canIssueQuantity(movements, issueQty) {
  const { quantity } = computeStockBalance(movements);
  return issueQty > 0 && issueQty <= quantity + 1e-9;
}

/**
 * @param {StockMovement[]} movements
 * @param {number} issueQty
 */
export function issueCostAmount(movements, issueQty) {
  const { avgCost } = computeStockBalance(movements);
  return issueQty * avgCost;
}
