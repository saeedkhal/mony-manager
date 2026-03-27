import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { BarChart } from "react-native-chart-kit";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { getClients, getGeneralTxs } from "../utils/db";
import { CURRENCY, STATUS_LABELS } from "../constants";
import { fmt } from "../utils/helpers";
import styles, { SCREEN_WIDTH } from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

const chartConfig = {
  backgroundColor: "#1e1b4b",
  backgroundGradientFrom: "#1e1b4b",
  backgroundGradientTo: "#0f172a",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  style: { borderRadius: 16 },
  propsForBackgroundLines: {
    strokeDasharray: "",
    stroke: "rgba(255, 255, 255, 0.08)",
  },
};

export default function Dashboard() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel } = useApp();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    let cancelled = false;
    Promise.all([getClients(), getGeneralTxs(activeFiscalYearId)])
      .then(([c, g]) => {
        if (!cancelled) {
          setClients(c || []);
          setGeneralTxs(g || []);
        }
      })
      .catch(() => {
        if (!cancelled) setClients([]);
        if (!cancelled) setGeneralTxs([]);
      });
    return () => { cancelled = true; };
  }, [loaded, isFocused, activeFiscalYearId]);

  const appData = useAppData(clients, generalTxs, [], [], activeFiscalYearId, activeFiscalYearLabel);
  const {
    fyClients,
    fyGeneralTxs,
    clientTotals,
    totalIncome,
    totalClientExp,
    totalGenExp,
    netProfit,
    monthlyData,
  } = appData;

  const chartData = fyClients
    .map((c) => {
      const t = clientTotals(c);
      return { name: c.name, دخل: t.income, مصروف: t.expense, ربح: t.profit };
    })
    .sort((a, b) => b.ربح - a.ربح);

  const monthlyChartData = {
    labels: monthlyData.map((m) => m.label),
    datasets: [
      { data: monthlyData.map((m) => m.دخل), color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})` },
      { data: monthlyData.map((m) => m.مصروف), color: (opacity = 1) => `rgba(244, 63, 94, ${opacity})` },
    ],
  };

  const clientChartData = {
    labels: chartData.slice(0, 10).map((c) => (c.name.length > 8 ? c.name.substring(0, 8) + "..." : c.name)),
    datasets: [
      { data: chartData.slice(0, 10).map((c) => c.دخل), color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})` },
      { data: chartData.slice(0, 10).map((c) => c.مصروف), color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})` },
    ],
  };

  const stats = [
    {
      label: "صافي الربح",
      val: netProfit,
      icon: "💰",
      color: netProfit >= 0 ? "#10b981" : "#f43f5e",
      bg: "rgba(16,185,129,0.08)",
    },
    { label: "إجمالي الدخل", val: totalIncome, icon: "📈", color: "#818cf8", bg: "rgba(129,140,248,0.08)" },
    { label: "مصروفات العملاء", val: totalClientExp, icon: "🔨", color: "#fb923c", bg: "rgba(251,146,60,0.08)" },
    { label: "مصروفات عامة", val: totalGenExp, icon: "🏢", color: "#f43f5e", bg: "rgba(244,63,94,0.08)" },
  ];

  return (
    <ScreenLayout>
      <View style={styles.dashboard}>
      <View style={styles.statsGrid}>
        {stats.map((c) => (
          <View key={c.label} style={[styles.statCard, { backgroundColor: c.bg, borderColor: c.color + "30" }]}>
            <Text style={styles.statIcon}>{c.icon}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
            <Text style={[styles.statValue, { color: c.color }]}>
              {fmt(c.val)} {CURRENCY}
            </Text>
          </View>
        ))}
      </View>

      {monthlyData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 الدخل والمصروفات شهرياً — {activeFiscalYearLabel}</Text>
          <BarChart
            data={monthlyChartData}
            width={SCREEN_WIDTH - 80}
            height={220}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        </View>
      )}

      {chartData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏆 ربحية العملاء — {activeFiscalYearLabel}</Text>
          <BarChart
            data={clientChartData}
            width={SCREEN_WIDTH - 80}
            height={200}
            chartConfig={chartConfig}
            style={styles.chart}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
          />
        </View>
      )}

      {fyClients.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 ملخص العملاء</Text>
          {[...fyClients]
            .sort((a, b) => clientTotals(b).profit - clientTotals(a).profit)
            .map((c) => {
              const t = clientTotals(c);
              const s = STATUS_LABELS[c.status];
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.clientSummaryItem}
                  onPress={() => navigation.navigate("clients")}
                >
                  <View style={styles.clientSummaryInfo}>
                    <Text style={styles.clientSummaryName}>{c.name}</Text>
                    <Text style={styles.clientSummaryProject}>{c.project}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                  </View>
                  <View style={styles.clientSummaryProfit}>
                    <Text style={[styles.clientSummaryProfitText, { color: t.profit >= 0 ? "#10b981" : "#f43f5e" }]}>
                      {t.profit >= 0 ? "+" : ""}
                      {fmt(t.profit)} {CURRENCY}
                    </Text>
                    <Text style={styles.clientSummaryProfitLabel}>صافي ربح</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      {fyClients.length === 0 && totalGenExp === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>لا توجد بيانات في السنة المالية {activeFiscalYearLabel}</Text>
        </View>
      )}
      </View>
    </ScreenLayout>
  );
}
