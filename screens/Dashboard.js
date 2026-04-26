import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { BarChart } from "react-native-chart-kit";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { getClients, getClientsPage, getGeneralTxs } from "../utils/db";
import { CURRENCY, STATUS_LABELS } from "../constants";
import { fmt } from "../utils/helpers";
import styles, { SCREEN_WIDTH } from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

/**
 * Must match `style.paddingRight` on BarChart (chart-kit uses it as the left Y-axis gutter in px).
 * Bars are laid out in (width − gutter); built-in X labels use the same offset + barWidth.
 */
const BAR_CHART_Y_AXIS_GUTTER = 64;
const BAR_CHART_BAR_WIDTH = 32;
/** With `withVerticalLabels={false}`, chart-kit leaves empty band under bars; negative margin pulls labels up (lower ratio = more gap below bars). */
const BAR_CHART_X_LABEL_PULL_UP_RATIO = 0.1;

const barChartCardStyle = [styles.chart, { paddingRight: BAR_CHART_Y_AXIS_GUTTER, marginTop: 8, marginBottom: 0 }];

/** Share of `total` (e.g. sub-line vs card total). Arabic numerals, one decimal when needed. */
function formatPctShare(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t === 0) return "—";
  const pct = (100 * p) / t;
  return `${pct.toLocaleString("ar-EG", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}٪`;
}

/** RN `Text` shapes Arabic correctly; SVG labels in chart-kit do not — use below charts. */
function ChartXAxisLabels({ labels, width, chartHeight, yAxisGutter = BAR_CHART_Y_AXIS_GUTTER, barPercentage = 1 }) {
  const n = labels?.length ?? 0;
  if (!n) return null;
  const plotW = width - yAxisGutter;
  const segment = plotW / n;
  const barW = BAR_CHART_BAR_WIDTH * barPercentage;
  /** Align cell midpoint with bar center: barCenter = i·segment + barW; flex center = i·segment + segment/2. */
  const labelShiftX = barW - segment / 2;
  const h = chartHeight ?? 220;
  const marginTop = -Math.round(h * BAR_CHART_X_LABEL_PULL_UP_RATIO);

  return (
    <View style={{ width, alignSelf: "center", marginTop, paddingBottom: 0 }}>
      <View
        style={{
          flexDirection: "row",
          width,
          paddingLeft: yAxisGutter,
          direction: "ltr",
        }}
      >
        {labels.map((label, i) => (
          <View key={`${i}-${String(label).slice(0, 24)}`} style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
            <View style={{ transform: [{ translateX: labelShiftX }] }}>
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
                style={{
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 11,
                }}
              >
                {label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

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

/** Page size for «ملخص العملاء» list only (charts/stats still use full `getClients()`). */
const DASH_CLIENT_SUMMARY_PAGE = 5;

/** Profitability bar chart: newest clients in the fiscal year (`id` desc, same as DB). */
const DASH_PROFITABILITY_CHART_COUNT = 5;

const CHART_WIDTH = SCREEN_WIDTH - 80;

export default function Dashboard() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel } = useApp();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);
  const [summaryClients, setSummaryClients] = useState([]);
  const [summaryHasMore, setSummaryHasMore] = useState(false);
  const [summaryLoadingMore, setSummaryLoadingMore] = useState(false);
  const summaryClientsRef = useRef([]);

  useEffect(() => {
    summaryClientsRef.current = summaryClients;
  }, [summaryClients]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    let cancelled = false;
    setSummaryClients([]);
    setSummaryHasMore(false);
    Promise.all([
      getClients(),
      getGeneralTxs(activeFiscalYearId),
      getClientsPage(DASH_CLIENT_SUMMARY_PAGE, 0),
    ])
      .then(([c, g, { clients: first, hasMore }]) => {
        if (!cancelled) {
          setClients(c || []);
          setGeneralTxs(g || []);
          setSummaryClients(first || []);
          setSummaryHasMore(!!hasMore);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
          setGeneralTxs([]);
          setSummaryClients([]);
          setSummaryHasMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, activeFiscalYearId]);

  const loadMoreSummaryClients = useCallback(async () => {
    if (!summaryHasMore || summaryLoadingMore || activeFiscalYearId == null) return;
    const offset = summaryClientsRef.current.length;
    setSummaryLoadingMore(true);
    try {
      const { clients: next, hasMore: hm } = await getClientsPage(DASH_CLIENT_SUMMARY_PAGE, offset);
      setSummaryClients((prev) => [...prev, ...(next || [])]);
      setSummaryHasMore(!!hm);
    } catch (_) {
      setSummaryHasMore(false);
    } finally {
      setSummaryLoadingMore(false);
    }
  }, [summaryHasMore, summaryLoadingMore, activeFiscalYearId]);

  const appData = useAppData(clients, generalTxs, [], [], activeFiscalYearId, activeFiscalYearLabel);
  const {
    fyClients,
    clientTotals,
    totalIncome,
    totalClientExp,
    totalGenExp,
    totalGenIncome,
    netProfit,
    monthlyData,
  } = appData;

  const clientsProfitabilityChart = [...fyClients]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, DASH_PROFITABILITY_CHART_COUNT)
    .map((c) => {
      const t = clientTotals(c);
      return { name: c.name, دخل: t.income, مصروف: t.expense, ربح: t.profit };
    });

  const monthlyChartData = {
    labels: monthlyData.map((m) => m.label),
    datasets: [
      { data: monthlyData.map((m) => m.دخل), color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})` },
      { data: monthlyData.map((m) => m.مصروف), color: (opacity = 1) => `rgba(244, 63, 94, ${opacity})` },
    ],
  };

  const clientChartLabels = clientsProfitabilityChart.map((c) => c.name);
  const clientChartData = {
    labels: clientChartLabels.map(() => " "),
    datasets: [
      {
        data: clientsProfitabilityChart.map((c) => c.دخل),
        color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
      },
      {
        data: clientsProfitabilityChart.map((c) => c.مصروف),
        color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})`,
      },
    ],
  };

  const totalExpenses = totalClientExp + totalGenExp;
  const totalSales = totalIncome + totalGenIncome;
  const clientNetProfit = totalIncome - totalClientExp;
  const generalNetProfit = totalGenIncome - totalGenExp;

  return (
    <ScreenLayout>
      <View style={styles.dashboard}>
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: netProfit >= 0 ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
              borderColor: (netProfit >= 0 ? "#10b981" : "#f43f5e") + "35",
            },
          ]}
        >
          <View style={styles.statCardTitleRow}>
            <Text style={styles.statIcon}>💰</Text>
            <Text style={styles.statCardMainTitle}>صافي الربح</Text>
          </View>
          <Text style={styles.statTotalCaption}>الإجمالي</Text>
          <Text style={[styles.statValue, { color: netProfit >= 0 ? "#10b981" : "#f43f5e" }]}>
            {fmt(netProfit)} {CURRENCY}
          </Text>
          <View style={styles.statSubGrid}>
            <View style={[styles.statSubCard, { borderColor: "rgba(129,140,248,0.25)" }]}>
              <Text style={styles.statSubLabel}>صافي من العملاء</Text>
              <Text style={[styles.statSubValue, { color: clientNetProfit >= 0 ? "#10b981" : "#f43f5e" }]}>
                {fmt(clientNetProfit)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(clientNetProfit, netProfit)}</Text>
            </View>
            <View style={[styles.statSubCard, { borderColor: "rgba(16,185,129,0.25)" }]}>
              <Text style={styles.statSubLabel}>صافي من الدخل العام</Text>
              <Text style={[styles.statSubValue, { color: generalNetProfit >= 0 ? "#10b981" : "#f43f5e" }]}>
                {fmt(generalNetProfit)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(generalNetProfit, netProfit)}</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: "rgba(244,63,94,0.06)", borderColor: "rgba(251,146,60,0.28)" },
          ]}
        >
          <View style={styles.statCardTitleRow}>
            <Text style={styles.statIcon}>📉</Text>
            <Text style={styles.statCardMainTitle}>المصروفات</Text>
          </View>
          <Text style={styles.statTotalCaption}>إجمالي المصروفات</Text>
          <Text style={[styles.statValue, { color: "#fb923c" }]}>
            {fmt(totalExpenses)} {CURRENCY}
          </Text>
          <View style={styles.statSubGrid}>
            <View style={[styles.statSubCard, { borderColor: "rgba(251,146,60,0.3)" }]}>
              <Text style={styles.statSubLabel}>مصروفات العملاء</Text>
              <Text style={[styles.statSubValue, { color: "#fb923c" }]}>
                {fmt(totalClientExp)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(totalClientExp, totalExpenses)}</Text>
            </View>
            <View style={[styles.statSubCard, { borderColor: "rgba(244,63,94,0.3)" }]}>
              <Text style={styles.statSubLabel}>مصروفات عامة</Text>
              <Text style={[styles.statSubValue, { color: "#f43f5e" }]}>
                {fmt(totalGenExp)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(totalGenExp, totalExpenses)}</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.statCard,
            { backgroundColor: "rgba(129,140,248,0.08)", borderColor: "rgba(129,140,248,0.28)" },
          ]}
        >
          <View style={styles.statCardTitleRow}>
            <Text style={styles.statIcon}>📈</Text>
            <Text style={styles.statCardMainTitle}>إجمالي المبيعات</Text>
          </View>
          <Text style={styles.statTotalCaption}>الإجمالي</Text>
          <Text style={[styles.statValue, { color: "#818cf8" }]}>
            {fmt(totalSales)} {CURRENCY}
          </Text>
          <View style={styles.statSubGrid}>
            <View style={[styles.statSubCard, { borderColor: "rgba(129,140,248,0.28)" }]}>
              <Text style={styles.statSubLabel}>دخل العملاء</Text>
              <Text style={[styles.statSubValue, { color: "#a5b4fc" }]}>
                {fmt(totalIncome)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(totalIncome, totalSales)}</Text>
            </View>
            <View style={[styles.statSubCard, { borderColor: "rgba(16,185,129,0.28)" }]}>
              <Text style={styles.statSubLabel}>دخل عام</Text>
              <Text style={[styles.statSubValue, { color: "#34d399" }]}>
                {fmt(totalGenIncome)} {CURRENCY}
              </Text>
              <Text style={styles.statSubPct}>{formatPctShare(totalGenIncome, totalSales)}</Text>
            </View>
          </View>
        </View>
      </View>

      {monthlyData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 الدخل والمصروفات شهرياً — {activeFiscalYearLabel}</Text>
          <BarChart
            data={monthlyChartData}
            width={CHART_WIDTH}
            height={220}
            chartConfig={chartConfig}
            style={barChartCardStyle}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
            withVerticalLabels={false}
          />
          <ChartXAxisLabels
            labels={monthlyChartData.labels}
            width={CHART_WIDTH}
            chartHeight={220}
            barPercentage={chartConfig.barPercentage ?? 1}
          />
        </View>
      )}

      {clientsProfitabilityChart.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏆 ربحية آخر {DASH_PROFITABILITY_CHART_COUNT} عملاء — {activeFiscalYearLabel}</Text>
          <BarChart
            data={clientChartData}
            width={CHART_WIDTH}
            height={200}
            chartConfig={chartConfig}
            style={barChartCardStyle}
            yAxisLabel=""
            yAxisSuffix=""
            showValuesOnTopOfBars
            withVerticalLabels={false}
          />
          <ChartXAxisLabels
            labels={clientChartLabels}
            width={CHART_WIDTH}
            chartHeight={200}
            barPercentage={chartConfig.barPercentage ?? 1}
          />
        </View>
      )}

      {fyClients.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 ملخص العملاء (الأحدث)</Text>
          {summaryClients.map((c) => {
            const t = clientTotals(c);
            const s = STATUS_LABELS[c.status];
            return (
              <TouchableOpacity
                key={c.id}
                style={styles.clientSummaryItem}
                onPress={() => navigation.navigate("clients", { openClientId: c.id })}
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
          {summaryHasMore ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { width: "100%", marginTop: 12 }]}
              onPress={loadMoreSummaryClients}
              disabled={summaryLoadingMore}
            >
              {summaryLoadingMore ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>تحميل المزيد</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {fyClients.length === 0 && totalGenExp === 0 && totalGenIncome === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>لا توجد بيانات في السنة المالية {activeFiscalYearLabel}</Text>
        </View>
      )}
      </View>
    </ScreenLayout>
  );
}
