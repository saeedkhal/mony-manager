import React, { useState, useEffect } from "react";
import { View, Text, TextInput } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { getClients, getGeneralTxs, getSettings, setSettings as dbSetSettings } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

const ZAKAT_RATE = 0.025;

export default function Zakat() {
  const { loaded, activeFY, customFYs } = useApp();
  const isFocused = useIsFocused();
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);
  const [nissabPrice, setNissabPrice] = useState(85000);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled && s?.nissabPrice != null) setNissabPrice(Number(s.nissabPrice) || 85000);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFY == null) return;
    let cancelled = false;
    Promise.all([getClients(), getGeneralTxs(activeFY)])
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
  }, [loaded, isFocused, activeFY]);

  const { totalIncome, totalClientExp, totalGenExp, netProfit } = useAppData(
    clients,
    generalTxs,
    [],
    [],
    activeFY,
    customFYs
  );

  const zakatBase = netProfit > 0 ? netProfit : 0;
  const zakatAmount = zakatBase * ZAKAT_RATE;
  const zakatDue = zakatBase >= nissabPrice;

  return (
    <ScreenLayout>
      <View style={styles.zakatView}>
      <View style={styles.zakatHeader}>
        <Text style={styles.zakatIcon}>🌙</Text>
        <Text style={styles.zakatTitle}>حساب زكاة المال</Text>
        <Text style={styles.zakatSubtitle}>
          السنة المالية {activeFY} — نسبة الزكاة 2.5%
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: "rgba(129,140,248,0.07)",
            borderColor: "rgba(129,140,248,0.25)",
          },
        ]}
      >
        <View style={styles.zakatNissabRow}>
          <View>
            <Text style={styles.zakatNissabLabel}>💎 قيمة النصاب (85 جرام ذهب)</Text>
            <Text style={styles.zakatNissabSubtext}>حدّث القيمة حسب سعر الذهب الحالي</Text>
          </View>
          <View style={styles.zakatNissabInput}>
            <TextInput
              style={[styles.input, { width: 130, textAlign: "center", fontSize: 14 }]}
              value={nissabPrice.toString()}
              onChangeText={(text) => setNissabPrice(Number(text) || 0)}
              onBlur={() => {
                dbSetSettings({ nissabPrice }).catch(() => {});
              }}
              keyboardType="numeric"
            />
            <Text style={styles.zakatNissabCurrency}>{CURRENCY}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 تفاصيل الحساب</Text>
        <View style={styles.zakatDetails}>
          {[
            ["📈 إجمالي الدخل", fmt(totalIncome), "#818cf8"],
            ["🔨 مصروفات العملاء", `- ${fmt(totalClientExp)}`, "#fb923c"],
            ["🏢 مصروفات عامة", `- ${fmt(totalGenExp)}`, "#f43f5e"],
          ].map(([l, v, c]) => (
            <View key={l} style={styles.zakatDetailRow}>
              <Text style={styles.zakatDetailLabel}>{l}</Text>
              <Text style={[styles.zakatDetailValue, { color: c }]}>
                {v} {CURRENCY}
              </Text>
            </View>
          ))}
          <View style={[styles.zakatDetailRow, styles.zakatDetailRowTotal]}>
            <Text style={styles.zakatDetailLabelTotal}>💰 صافي الربح (وعاء الزكاة)</Text>
            <Text
              style={[
                styles.zakatDetailValueTotal,
                { color: netProfit >= 0 ? "#10b981" : "#f43f5e" },
              ]}
            >
              {fmt(zakatBase)} {CURRENCY}
            </Text>
          </View>
          <View style={styles.zakatDetailRow}>
            <Text style={styles.zakatDetailLabel}>📐 النصاب المطلوب</Text>
            <Text style={[styles.zakatDetailValue, { color: "#818cf8" }]}>
              {fmt(nissabPrice)} {CURRENCY}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: zakatDue ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.1)",
            borderColor: zakatDue ? "rgba(16,185,129,0.35)" : "rgba(100,116,139,0.25)",
            alignItems: "center",
            padding: 28,
          },
        ]}
      >
        {zakatDue ? (
          <>
            <Text style={styles.zakatResultIcon}>✅</Text>
            <Text style={styles.zakatResultText}>بلغ الربح النصاب — تجب الزكاة</Text>
            <Text style={styles.zakatResultAmount}>{fmt(zakatAmount)}</Text>
            <Text style={styles.zakatResultCurrency}>{CURRENCY}</Text>
            <Text style={styles.zakatResultFormula}>
              {fmt(zakatBase)} × 2.5% = {fmt(zakatAmount)} {CURRENCY}
            </Text>
            <View style={styles.zakatResultMessage}>
              <Text style={styles.zakatResultMessageText}>🌙 تقبّل الله منك وبارك في رزقك</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.zakatResultIcon}>ℹ️</Text>
            <Text style={styles.zakatResultText}>لم يبلغ الربح النصاب بعد</Text>
            <Text style={styles.zakatResultSubtext}>
              يحتاج الربح أن يبلغ{" "}
              <Text style={styles.zakatResultSubtextHighlight}>
                {fmt(nissabPrice)} {CURRENCY}
              </Text>{" "}
              لتجب الزكاة
            </Text>
            {netProfit > 0 && (
              <Text style={styles.zakatResultSubtext}>
                المتبقي للنصاب:{" "}
                <Text style={[styles.zakatResultSubtextHighlight, { color: "#f59e0b" }]}>
                  {fmt(nissabPrice - zakatBase)} {CURRENCY}
                </Text>
              </Text>
            )}
          </>
        )}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: "rgba(245,158,11,0.08)",
            borderColor: "rgba(245,158,11,0.2)",
          },
        ]}
      >
        <Text style={styles.zakatWarningTitle}>⚠️ تنبيه</Text>
        <Text style={styles.zakatWarningText}>
          هذا الحساب تقديري بناءً على بيانات المعرض. يُنصح بمراجعة أهل العلم لضبط وعاء الزكاة
          بدقة حسب ظروفك.
        </Text>
      </View>
      </View>
    </ScreenLayout>
  );
}
