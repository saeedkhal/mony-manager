import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY, STATUS_LABELS } from "../constants";
import { getFiscalYear } from "../utils/helpers";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function Clients() {
  const {
    clients,
    generalTxs,
    workers,
    suppliers,
    activeFY,
    selectedClient,
    setSelectedClient,
    openClientTx,
    deleteClientTx,
    deleteClient,
    toggleStatus,
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { fyClients, clientTotals } = appData;

  const activeClient = clients.find((c) => c.id === selectedClient);
  const activeClientFY = activeClient
    ? { ...activeClient, txs: activeClient.txs.filter((t) => getFiscalYear(t.date) === activeFY) }
    : null;

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || "غير محدد";
  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "غير محدد";

  if (selectedClient && activeClient && activeClientFY) {
    const t = clientTotals(activeClientFY);
    const s = STATUS_LABELS[activeClient.status];
    return (
      <View style={styles.clientDetail}>
        <View style={styles.clientDetailHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedClient(null)}>
            <Text style={styles.backBtnText}>← رجوع</Text>
          </TouchableOpacity>
          <View style={styles.clientDetailInfo}>
            <Text style={styles.clientDetailName}>{activeClient.name}</Text>
            <Text style={styles.clientDetailMeta}>
              {activeClient.project} — السنة المالية {activeFY}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.statusBtn, { backgroundColor: s.bg }]}
            onPress={() => toggleStatus(activeClient.id)}
          >
            <Text style={[styles.statusBtnText, { color: s.color }]}>{s.label}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteClient(activeClient.id)}>
            <Text style={styles.deleteBtnText}>حذف العميل</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.clientDetailStats}>
          {[
            ["💵 إجمالي الدخل", "#818cf8", "rgba(129,140,248,0.1)", t.income],
            ["🔨 إجمالي المصروفات", "#fb923c", "rgba(251,146,60,0.1)", t.expense],
            [
              "💰 صافي الربح",
              t.profit >= 0 ? "#10b981" : "#f43f5e",
              t.profit >= 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)",
              t.profit,
            ],
          ].map(([l, col, bg, v]) => (
            <View key={l} style={[styles.clientDetailStatCard, { backgroundColor: bg, borderColor: col + "30" }]}>
              <Text style={styles.clientDetailStatLabel}>{l}</Text>
              <Text style={[styles.clientDetailStatValue, { color: col }]}>
                {fmt(v)} {CURRENCY}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.clientDetailActions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnIncome, { flex: 1 }]}
            onPress={() => openClientTx(activeClient.id, "income")}
          >
            <Text style={styles.btnText}>+ دفعة مستلمة 📈</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnExpense, { flex: 1 }]}
            onPress={() => openClientTx(activeClient.id, "expense")}
          >
            <Text style={styles.btnText}>+ مصروف على العميل 🔨</Text>
          </TouchableOpacity>
        </View>

        <View>
          {activeClientFY.txs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {[...activeClientFY.txs].reverse().map((tx) => (
                <View
                  key={tx.id}
                  style={[
                    styles.txItem,
                    { borderColor: tx.type === "income" ? "rgba(99,102,241,0.3)" : "rgba(251,146,60,0.3)" },
                  ]}
                >
                  <Text style={styles.txIcon}>{tx.type === "income" ? "💵" : "🔨"}</Text>
                  <View style={styles.txContent}>
                    <View style={styles.txTags}>
                      <View
                        style={[
                          styles.tag,
                          {
                            backgroundColor:
                              tx.type === "income" ? "rgba(99,102,241,0.2)" : "rgba(251,146,60,0.2)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagText,
                            { color: tx.type === "income" ? "#818cf8" : "#fb923c" },
                          ]}
                        >
                          {tx.cat}
                        </Text>
                      </View>
                      {tx.workerId && (
                        <View style={[styles.tag, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#f59e0b" }]}>
                            👷 {getWorkerName(tx.workerId)}
                          </Text>
                        </View>
                      )}
                      {tx.supplierId && (
                        <View style={[styles.tag, { backgroundColor: "rgba(139,92,246,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#a78bfa" }]}>
                            🏭 {getSupplierName(tx.supplierId)}
                          </Text>
                        </View>
                      )}
                      {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                    </View>
                    <Text style={styles.txDate}>{tx.date}</Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.type === "income" ? "#818cf8" : "#fb923c" },
                    ]}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {fmt(tx.amount)} {CURRENCY}
                  </Text>
                  <TouchableOpacity
                    style={styles.txEditBtn}
                    onPress={() => openClientTx(activeClient.id, tx.type, tx)}
                  >
                    <Text style={styles.txEditBtnText}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.txDeleteBtn}
                    onPress={() => deleteClientTx(activeClient.id, tx.id)}
                  >
                    <Text style={styles.txDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.clientsView}>
      {clients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>لا يوجد عملاء بعد، ابدأ بإضافة عميل!</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionSubtitle}>
            عرض العملاء الذين لهم معاملات في السنة المالية {activeFY}
          </Text>
          {fyClients.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد معاملات في هذه السنة المالية</Text>
            </View>
          )}
          <View style={styles.clientsGrid}>
            {fyClients.map((c) => {
              const t = clientTotals(c);
              const s = STATUS_LABELS[c.status];
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.clientCard}
                  onPress={() => setSelectedClient(c.id)}
                >
                  <View style={styles.clientCardHeader}>
                    <View>
                      <Text style={styles.clientCardName}>{c.name}</Text>
                      <Text style={styles.clientCardMeta}>
                        {c.project} • {c.createdAt}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                  <View style={styles.clientCardStats}>
                    <View style={styles.clientCardStat}>
                      <Text style={styles.clientCardStatLabel}>دخل</Text>
                      <Text style={[styles.clientCardStatValue, { color: "#818cf8" }]}>{fmt(t.income)}</Text>
                    </View>
                    <View style={styles.clientCardStat}>
                      <Text style={styles.clientCardStatLabel}>مصروف</Text>
                      <Text style={[styles.clientCardStatValue, { color: "#fb923c" }]}>{fmt(t.expense)}</Text>
                    </View>
                    <View style={styles.clientCardStat}>
                      <Text style={styles.clientCardStatLabel}>ربح</Text>
                      <Text
                        style={[
                          styles.clientCardStatValue,
                          { color: t.profit >= 0 ? "#10b981" : "#f43f5e" },
                        ]}
                      >
                        {fmt(t.profit)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
