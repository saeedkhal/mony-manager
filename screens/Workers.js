import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import WorkerDetail from "./WorkerDetail";

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
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const { workerStats } = appData;

  if (selectedWorker) {
    return <WorkerDetail />;
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
