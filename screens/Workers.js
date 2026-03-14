import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getWorkers, getClients } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt, getFiscalYear } from "../utils/helpers";
import styles from "../styles/AppStyles";
import WorkerDetail from "./WorkerDetail";

export default function Workers() {
  const {
    workersVersion,
    clientsVersion,
    loaded,
    activeFY,
    selectedWorker,
    setSelectedWorker,
    setForm,
    setModal,
    deleteWorker,
  } = useApp();
  const [workers, setWorkers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getWorkers(), getClients()])
      .then(([w, c]) => {
        if (!cancelled) {
          setWorkers(w || []);
          setClients(c || []);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkers([]);
        if (!cancelled) setClients([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded, workersVersion, clientsVersion]);

  const workerStats = useMemo(() => {
    return (workers || [])
      .map((w) => {
        const matchingTxs = (clients || []).flatMap((c) =>
          (c.txs || [])
            .filter(
              (t) =>
                getFiscalYear(t.date) === activeFY &&
                t.type === "expense" &&
                t.workerId === w.id
            )
            .map((t) => ({ ...t, clientId: c.id, clientName: c.name }))
        );
        const total = matchingTxs.reduce((s, t) => s + t.amount, 0);
        const count = matchingTxs.length;
        return { ...w, total, count, txs: matchingTxs };
      })
      .sort((a, b) => b.total - a.total);
  }, [workers, clients, activeFY]);

  if (selectedWorker) return <WorkerDetail />;

  if (loading) {
    return (
      <View style={styles.workersView}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
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
