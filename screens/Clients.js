import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { STATUS_LABELS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ClientDetail from "./ClientDetail";

export default function Clients() {
  const {
    clients,
    generalTxs,
    workers,
    suppliers,
    activeFY,
    customFYs,
    selectedClient,
    setSelectedClient,
  } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY, customFYs);
  const { fyClients, clientTotals } = appData;

  if (selectedClient) {
    return <ClientDetail />;
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
