import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import SupplierDetail from "./SupplierDetail";

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
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { supplierStats } = appData;

  if (selectedSupplier) {
    return <SupplierDetail />;
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
