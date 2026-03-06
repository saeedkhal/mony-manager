import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { CURRENCY, GENERAL_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function General() {
  const { clients, generalTxs, workers, suppliers, activeFY, customFYs, setGeneralTxs } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY, customFYs);
  const { fyGeneralTxs } = appData;

  return (
    <View style={styles.generalView}>
      <View style={styles.generalStatsGrid}>
        {GENERAL_EXPENSE_CATS.map((cat) => {
          const total = fyGeneralTxs
            .filter((t) => t.cat === cat)
            .reduce((s, t) => s + t.amount, 0);
          return total > 0 ? (
            <View
              key={cat}
              style={[
                styles.card,
                {
                  backgroundColor: "rgba(244,63,94,0.07)",
                  borderColor: "rgba(244,63,94,0.2)",
                  alignItems: "center",
                  minWidth: 150,
                  flex: 1,
                },
              ]}
            >
              <Text style={styles.generalStatLabel}>{cat}</Text>
              <Text style={styles.generalStatValue}>{fmt(total)}</Text>
              <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
            </View>
          ) : null;
        })}
      </View>
      {fyGeneralTxs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏢</Text>
          <Text style={styles.emptyText}>
            لا توجد مصروفات عامة في السنة المالية {activeFY}
          </Text>
        </View>
      ) : (
        <View style={styles.txList}>
          {[...fyGeneralTxs].reverse().map((t) => (
            <View key={t.id} style={[styles.txItem, { borderColor: "rgba(244,63,94,0.2)" }]}>
              <Text style={styles.txIcon}>🏢</Text>
              <View style={styles.txContent}>
                <View style={styles.txTags}>
                  <View style={[styles.tag, { backgroundColor: "rgba(244,63,94,0.15)" }]}>
                    <Text style={[styles.tagText, { color: "#f43f5e" }]}>{t.cat}</Text>
                  </View>
                  {t.note && <Text style={styles.txNote}>{t.note}</Text>}
                </View>
                <Text style={styles.txDate}>{t.date}</Text>
              </View>
              <Text style={[styles.txAmount, { color: "#f43f5e" }]}>
                -{fmt(t.amount)} {CURRENCY}
              </Text>
              <TouchableOpacity
                style={styles.txDeleteBtn}
                onPress={() => setGeneralTxs((p) => p.filter((x) => x.id !== t.id))}
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
