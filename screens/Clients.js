import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getClients } from "../utils/db";
import { STATUS_LABELS } from "../constants";
import { fmt, getFiscalYear } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ClientDetail from "./ClientDetail";
import ScreenLayout from "../components/ScreenLayout";

export default function Clients() {
  const { loaded, activeFY } = useApp();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    getClients()
      .then((list) => { if (!cancelled) setClients(list || []); })
      .catch(() => { if (!cancelled) setClients([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded]);

  const clientsWithYearTxs = useMemo(
    () =>
      (clients || []).map((c) => ({
        ...c,
        txs: (c.txs || []).filter((t) => getFiscalYear(t?.date) === activeFY),
      })),
    [clients, activeFY]
  );

  const totalsForYear = (c) => {
    const txs = (c.txs || []).filter((t) => getFiscalYear(t?.date) === activeFY);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, profit: income - expense };
  };

  if (selectedClient) {
    return (
      <ClientDetail
        selectedClient={selectedClient}
        setSelectedClient={setSelectedClient}
        onClientDeleted={() => setSelectedClient(null)}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.clientsView}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </View>
    );
  }

  return (
    <ScreenLayout>
      <View style={styles.clientsView}>
      {clients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>لا يوجد عملاء بعد، ابدأ بإضافة عميل!</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionSubtitle}>
            جميع العملاء — أرقام السنة المالية {activeFY}
          </Text>
          <View style={styles.clientsGrid}>
            {clientsWithYearTxs.map((c) => {
              const t = totalsForYear(c);
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
    </ScreenLayout>
  );
}
