import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function SupplierDetail() {
  const {
    clients,
    generalTxs,
    workers,
    suppliers,
    activeFY,
    selectedSupplier,
    setSelectedSupplier,
    setForm,
    setModal,
    deleteClientTx,
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { supplierStats } = appData;
  const activeSupplier = supplierStats.find((s) => s.id === selectedSupplier);

  if (!activeSupplier) return null;

  return (
    <View style={styles.supplierDetail}>
      <View style={styles.clientDetailBackRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedSupplier(null)}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.backBtnText}> رجوع</Text>
      </View>
      <View style={styles.clientDetailHeaderStack}>
        <Text style={styles.clientDetailName} numberOfLines={2}>
          🏭 {activeSupplier.name}
        </Text>
        <Text style={styles.clientDetailMeta}>السنة المالية {activeFY}</Text>
        {activeSupplier.phone ? (
          <Text style={styles.clientDetailMeta}>📞 {activeSupplier.phone}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.editBtn, styles.clientDetailHeaderBtn]}
          onPress={() => {
            setForm({
              editId: activeSupplier.id,
              name: activeSupplier.name,
              phone: activeSupplier.phone,
              category: activeSupplier.category,
            });
            setModal("addSupplier");
          }}
        >
          <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)" },
        ]}
      >
        <Text style={styles.supplierDetailStatsLabel}>
          إجمالي المشتريات من {activeSupplier.name}
        </Text>
        <Text style={styles.supplierDetailStatsValue}>
          {fmt(activeSupplier.total)} {CURRENCY}
        </Text>
        <Text style={styles.supplierDetailStatsCount}>
          {activeSupplier.count} معاملة في {activeFY}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnSupplier, { width: "100%", marginBottom: 20 }]}
        onPress={() => {
          setForm({
            txType: "expense",
            cat: activeSupplier.category || "قماش",
            supplierId: activeSupplier.id,
            date: new Date().toISOString().split("T")[0],
          });
          setModal("addSupplierTx");
        }}
      >
        <Text style={styles.btnText}>+ إضافة مشتريات من {activeSupplier.name}</Text>
      </TouchableOpacity>

      {activeSupplier.txs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
        </View>
      ) : (
        <View style={styles.txList}>
          {[...activeSupplier.txs].reverse().map((tx) => (
            <View key={tx.id} style={[styles.txItemStack, { borderColor: "rgba(251,146,60,0.3)" }]}>
              <View style={styles.txItemRow}>
                <Text style={styles.txIcon}>🔨</Text>
                <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                  <Text style={[styles.tagText, { color: "#818cf8" }]}>👤 {tx.clientName}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: "rgba(251,146,60,0.2)" }]}>
                  <Text style={[styles.tagText, { color: "#fb923c" }]}>{tx.cat}</Text>
                </View>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
              <View style={styles.txTags}>
                {tx.note ? <Text style={styles.txNote}>{tx.note}</Text> : null}
              </View>
              <View style={styles.txItemActionsRow}>
                <Text style={[styles.txAmount, { color: "#fb923c", minWidth: undefined }]}>
                  -{fmt(tx.amount)} {CURRENCY}
                </Text>
                <View style={styles.txItemButtons}>
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
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
