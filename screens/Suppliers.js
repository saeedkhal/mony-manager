import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function Suppliers() {
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
    deleteSupplier,
    deleteClientTx,
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { supplierStats } = appData;
  const activeSupplier = supplierStats.find((s) => s.id === selectedSupplier);

  if (selectedSupplier && activeSupplier) {
    return (
      <View style={styles.supplierDetail}>
        <View style={styles.supplierDetailHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedSupplier(null)}>
            <Text style={styles.backBtnText}>← رجوع</Text>
          </TouchableOpacity>
          <View style={styles.supplierDetailInfo}>
            <Text style={styles.supplierDetailName}>🏭 {activeSupplier.name}</Text>
            <Text style={styles.supplierDetailMeta}>السنة المالية {activeFY}</Text>
            {activeSupplier.phone && (
              <Text style={styles.supplierDetailMeta}>📞 {activeSupplier.phone}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.editBtn}
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
    <View style={styles.suppliersView}>
      {suppliers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏭</Text>
          <Text style={styles.emptyText}>لا يوجد موردين بعد</Text>
        </View>
      ) : (
        <View style={styles.suppliersGrid}>
          {supplierStats.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.supplierCard}
              onPress={() => setSelectedSupplier(s.id)}
            >
              <View style={styles.supplierCardHeader}>
                <View>
                  <Text style={styles.supplierCardName}>🏭 {s.name}</Text>
                  {s.category && (
                    <Text style={styles.supplierCardCategory}>{s.category}</Text>
                  )}
                  {s.phone && <Text style={styles.supplierCardPhone}>📞 {s.phone}</Text>}
                </View>
                <View style={styles.supplierCardActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setForm({
                        editId: s.id,
                        name: s.name,
                        phone: s.phone,
                        category: s.category,
                      });
                      setModal("addSupplier");
                    }}
                  >
                    <Text style={styles.iconBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnDanger]}
                    onPress={(e) => {
                      e.stopPropagation();
                      deleteSupplier(s.id);
                    }}
                  >
                    <Text style={styles.iconBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.supplierCardStats}>
                <Text style={styles.supplierCardStatsLabel}>إجمالي المشتريات ({activeFY})</Text>
                <Text style={styles.supplierCardStatsValue}>
                  {fmt(s.total)} {CURRENCY}
                </Text>
                <Text style={styles.supplierCardStatsCount}>{s.count} معاملة</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
