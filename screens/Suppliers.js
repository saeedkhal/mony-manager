import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt, getFiscalYear } from "../utils/helpers";
import styles from "../styles/AppStyles";
import SupplierDetail from "./SupplierDetail";

export default function Suppliers() {
  const {
    suppliersVersion,
    clientsVersion,
    loaded,
    activeFY,
    selectedSupplier,
    setSelectedSupplier,
    setForm,
    setModal,
    deleteSupplier,
  } = useApp();
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
  }, [loaded, suppliersVersion, clientsVersion]);

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

  if (selectedSupplier) return <SupplierDetail />;

  if (loading) {
    return (
      <View style={styles.suppliersView}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
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
