import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt, getFiscalYear } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function SupplierDetail({ selectedSupplier, setSelectedSupplier }) {
  const { loaded, activeFY, setForm, setModal, deleteClientTx } = useApp();
  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getSuppliers(), getClients()])
      .then(([s, c]) => {
        if (!cancelled) {
          setSuppliers(s || []);
          setClients(c || []);
        }
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
        if (!cancelled) setClients([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded, selectedSupplier]);

  const supplierStats = useMemo(() => {
    return (suppliers || [])
      .map((s) => {
        const matchingTxs = (clients || []).flatMap((c) =>
          (c.txs || [])
            .filter(
              (t) =>
                getFiscalYear(t.date) === activeFY &&
                t.type === "expense" &&
                t.supplierId === s.id
            )
            .map((t) => ({ ...t, clientId: c.id, clientName: c.name }))
        );
        const total = matchingTxs.reduce((sum, t) => sum + t.amount, 0);
        const count = matchingTxs.length;
        return { ...s, total, count, txs: matchingTxs };
      })
      .sort((a, b) => b.total - a.total);
  }, [suppliers, clients, activeFY]);

  const activeSupplier = useMemo(
    () => (selectedSupplier ? supplierStats.find((s) => s.id === selectedSupplier) : null),
    [supplierStats, selectedSupplier]
  );

  if (!selectedSupplier) return null;
  if (loading) {
    return (
      <View style={styles.supplierDetail}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }
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
