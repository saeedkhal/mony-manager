import { useMemo } from "react";
import { getFiscalYear, getCurrentFiscalYear, getStartYearFromFiscalLabel } from "../utils/helpers";
import { MONTHS_AR } from "../constants";

export function useAppData(
  clients,
  generalTxs,
  workers,
  suppliers,
  activeFiscalYearId,
  activeFiscalYearLabel,
) {
  const allFYs = useMemo(() => {
    const set = new Set([getCurrentFiscalYear()]);
    clients.forEach((c) => {
      c.txs.forEach((t) => {
        const fy = getFiscalYear(t.date);
        if (fy) set.add(fy);
      });
    });
    generalTxs.forEach((t) => {
      const fy = getFiscalYear(t.date);
      if (fy) set.add(fy);
    });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [clients, generalTxs]);

  const fyClients = useMemo(() => {
    if (activeFiscalYearId == null) return [];
    const id = Number(activeFiscalYearId);
    return clients
      .filter((c) => Number(c.fiscalYearId) === id)
      .map((c) => ({ ...c, txs: [...(c.txs || [])] }));
  }, [clients, activeFiscalYearId]);

  const fyGeneralTxs = useMemo(() => {
    if (activeFiscalYearId == null) return [];
    const id = Number(activeFiscalYearId);
    return generalTxs.filter((t) => Number(t.fiscalYearId) === id);
  }, [generalTxs, activeFiscalYearId]);

  const clientTotals = (c) => {
    const income = c.txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = c.txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, profit: income - expense };
  };

  const totalIncome = useMemo(() => fyClients.reduce((s, c) => s + clientTotals(c).income, 0), [fyClients]);
  const totalClientExp = useMemo(() => fyClients.reduce((s, c) => s + clientTotals(c).expense, 0), [fyClients]);
  const totalGenExp = useMemo(() => fyGeneralTxs.reduce((s, t) => s + t.amount, 0), [fyGeneralTxs]);
  const netProfit = totalIncome - totalClientExp - totalGenExp;

  const monthlyData = useMemo(() => {
    const sy = getStartYearFromFiscalLabel(activeFiscalYearLabel);
    const months = Array.from({ length: 12 }, (_, i) => {
      const realMonth = i + 2 > 12 ? i + 2 - 12 : i + 2;
      const realYr = realMonth === 1 ? sy + 1 : sy;
      const mKey = `${realYr}-${String(realMonth).padStart(2, "0")}`;
      return { label: MONTHS_AR[realMonth - 1], key: mKey, دخل: 0, مصروف: 0 };
    });
    fyClients.forEach((c) =>
      c.txs.forEach((t) => {
        const mk = t.date?.slice(0, 7);
        const m = months.find((x) => x.key === mk);
        if (m) {
          if (t.type === "income") m.دخل += t.amount;
          else m.مصروف += t.amount;
        }
      }),
    );
    fyGeneralTxs.forEach((t) => {
      const mk = t.date?.slice(0, 7);
      const m = months.find((x) => x.key === mk);
      if (m) m.مصروف += t.amount;
    });
    return months.filter((m) => m.دخل > 0 || m.مصروف > 0);
  }, [fyClients, fyGeneralTxs, activeFiscalYearLabel]);

  const workerStats = useMemo(
    () =>
      workers
        .map((w) => {
          const total = fyClients
            .flatMap((c) => c.txs.filter((t) => t.type === "expense" && t.workerId === w.id))
            .reduce((s, t) => s + t.amount, 0);
          const count = fyClients.flatMap((c) =>
            c.txs.filter((t) => t.type === "expense" && t.workerId === w.id),
          ).length;
          const txs = fyClients.flatMap((c) =>
            c.txs
              .filter((t) => t.type === "expense" && t.workerId === w.id)
              .map((t) => ({ ...t, clientId: c.id, clientName: c.name })),
          );
          return { ...w, total, count, txs };
        })
        .sort((a, b) => b.total - a.total),
    [workers, fyClients],
  );

  const supplierStats = useMemo(
    () =>
      suppliers
        .map((s) => {
          const total = fyClients
            .flatMap((c) => c.txs.filter((t) => t.type === "expense" && t.supplierId === s.id))
            .reduce((sum, t) => sum + t.amount, 0);
          const count = fyClients.flatMap((c) =>
            c.txs.filter((t) => t.type === "expense" && t.supplierId === s.id),
          ).length;
          const txs = fyClients.flatMap((c) =>
            c.txs
              .filter((t) => t.type === "expense" && t.supplierId === s.id)
              .map((t) => ({ ...t, clientId: c.id, clientName: c.name })),
          );
          return { ...s, total, count, txs };
        })
        .sort((a, b) => b.total - a.total),
    [suppliers, fyClients],
  );

  return {
    allFYs,
    fyClients,
    fyGeneralTxs,
    clientTotals,
    totalIncome,
    totalClientExp,
    totalGenExp,
    netProfit,
    monthlyData,
    workerStats,
    supplierStats,
  };
}
