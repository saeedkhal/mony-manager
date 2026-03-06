import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function Workers() {
  const {
    clients,
    generalTxs,
    workers,
    suppliers,
    activeFY,
    selectedWorker,
    setSelectedWorker,
    setForm,
    setModal,
    deleteWorker,
    deleteClientTx,
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { workerStats } = appData;
  const activeWorker = workerStats.find((w) => w.id === selectedWorker);

  if (selectedWorker && activeWorker) {
    return (
      <View style={styles.workerDetail}>
        <View style={styles.workerDetailHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedWorker(null)}>
            <Text style={styles.backBtnText}>← رجوع</Text>
          </TouchableOpacity>
          <View style={styles.workerDetailInfo}>
            <Text style={styles.workerDetailName}>👷 {activeWorker.name}</Text>
            <Text style={styles.workerDetailMeta}>السنة المالية {activeFY}</Text>
            {activeWorker.phone && <Text style={styles.workerDetailMeta}>📞 {activeWorker.phone}</Text>}
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => {
              setForm({ editId: activeWorker.id, name: activeWorker.name, phone: activeWorker.phone });
              setModal("addWorker");
            }}
          >
            <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)" },
          ]}
        >
          <Text style={styles.workerDetailStatsLabel}>إجمالي المصروفات على {activeWorker.name}</Text>
          <Text style={styles.workerDetailStatsValue}>
            {fmt(activeWorker.total)} {CURRENCY}
          </Text>
          <Text style={styles.workerDetailStatsCount}>
            {activeWorker.count} معاملة في {activeFY}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnWorker, { width: "100%", marginBottom: 20 }]}
          onPress={() => {
            setForm({
              txType: "expense",
              cat: "مصنعية",
              workerId: activeWorker.id,
              date: new Date().toISOString().split("T")[0],
            });
            setModal("addWorkerTx");
          }}
        >
          <Text style={styles.btnText}>+ إضافة مصروف جديد لـ {activeWorker.name}</Text>
        </TouchableOpacity>

        {activeWorker.txs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {[...activeWorker.txs].reverse().map((tx) => (
              <View key={tx.id} style={[styles.txItem, { borderColor: "rgba(251,146,60,0.3)" }]}>
                <Text style={styles.txIcon}>🔨</Text>
                <View style={styles.txContent}>
                  <View style={styles.txTags}>
                    <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#818cf8" }]}>👤 {tx.clientName}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: "rgba(251,146,60,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#fb923c" }]}>{tx.cat}</Text>
                    </View>
                    {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                  </View>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
                <Text style={[styles.txAmount, { color: "#fb923c" }]}>
                  -{fmt(tx.amount)} {CURRENCY}
                </Text>
                <TouchableOpacity
                  style={styles.txEditBtn}
                  onPress={() => {
                    setForm({
                      editTxId: tx.id,
                      clientId: tx.clientId,
                      txType: tx.type,
                      amount: tx.amount,
                      cat: tx.cat,
                      note: tx.note || "",
                      date: tx.date,
                      workerId: tx.workerId,
                      supplierId: tx.supplierId,
                    });
                    setModal("addClientTx");
                  }}
                >
                  <Text style={styles.txEditBtnText}>تعديل</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.txDeleteBtn}
                  onPress={() => deleteClientTx(tx.clientId, tx.id)}
                >
                  <Text style={styles.txDeleteBtnText}>حذف</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.workersView}>
      {workers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👷</Text>
          <Text style={styles.emptyText}>لا يوجد صنايعية بعد</Text>
        </View>
      ) : (
        <View style={styles.workersGrid}>
          {workerStats.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.workerCard}
              onPress={() => setSelectedWorker(w.id)}
            >
              <View style={styles.workerCardHeader}>
                <View>
                  <Text style={styles.workerCardName}>👷 {w.name}</Text>
                  {w.phone && <Text style={styles.workerCardPhone}>📞 {w.phone}</Text>}
                </View>
                <View style={styles.workerCardActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setForm({ editId: w.id, name: w.name, phone: w.phone });
                      setModal("addWorker");
                    }}
                  >
                    <Text style={styles.iconBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnDanger]}
                    onPress={(e) => {
                      e.stopPropagation();
                      deleteWorker(w.id);
                    }}
                  >
                    <Text style={styles.iconBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.workerCardStats}>
                <Text style={styles.workerCardStatsLabel}>إجمالي المصروفات ({activeFY})</Text>
                <Text style={styles.workerCardStatsValue}>
                  {fmt(w.total)} {CURRENCY}
                </Text>
                <Text style={styles.workerCardStatsCount}>{w.count} معاملة</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
