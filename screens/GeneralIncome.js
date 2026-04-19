import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { getGeneralTxs, deleteGeneralTx as dbDeleteGeneralTx, getActiveFiscalYear, getActiveFiscalYearId, upsertGeneralTx } from "../utils/db";
import { CURRENCY, GENERAL_INCOME_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";

const INCOME_COLOR = "#10b981";
const INCOME_CAT_SET = new Set(GENERAL_INCOME_CATS);

function txAmount(t) {
  const n = Number(t.amount);
  return Number.isFinite(n) ? n : 0;
}

export default function GeneralIncome() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
      setGeneralTxs((prev) => prev.filter((t) => String(t.id) !== String(id)));
    } catch (_) {}
  };
  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    let cancelled = false;
    getGeneralTxs(activeFiscalYearId)
      .then((g) => {
        if (!cancelled) setGeneralTxs((g || []).filter((t) => t.txKind === "income"));
      })
      .catch(() => {
        if (!cancelled) setGeneralTxs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, activeFiscalYearId, modal]);

  const saveGeneralIncome = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    await getActiveFiscalYear();
    const fiscalYearId = await getActiveFiscalYearId();
    const tx = {
      id: form.editTxId || Date.now(),
      amount: Number(form.amount),
      cat: form.cat || GENERAL_INCOME_CATS[0],
      note: form.note || "",
      date,
      fiscalYearId: fiscalYearId ?? null,
      txKind: "income",
    };
    try {
      await upsertGeneralTx(tx);
      if (fiscalYearId != null) {
        const g = await getGeneralTxs(fiscalYearId);
        setGeneralTxs((g || []).filter((t) => t.txKind === "income"));
      }
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const { totalAllIncome, uncategorizedIncome, perCatTotals } = useMemo(() => {
    const perCatTotals = Object.fromEntries(GENERAL_INCOME_CATS.map((c) => [c, 0]));
    let totalAllIncome = 0;
    let uncategorizedIncome = 0;
    for (const t of generalTxs) {
      const amt = txAmount(t);
      totalAllIncome += amt;
      if (INCOME_CAT_SET.has(t.cat)) perCatTotals[t.cat] += amt;
      else uncategorizedIncome += amt;
    }
    return { totalAllIncome, uncategorizedIncome, perCatTotals };
  }, [generalTxs]);

  return (
    <>
      <ScreenLayout>
        <View style={styles.generalView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGeneralIncome, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setForm({
                cat: GENERAL_INCOME_CATS[0],
                date: new Date().toISOString().split("T")[0],
              });
              setModal("addGeneralIncome");
            }}
          >
            <Text style={styles.btnText}>+ دخل عام</Text>
          </TouchableOpacity>
          {generalTxs.length > 0 ? (
            <View
              style={[
                styles.card,
                {
                  alignSelf: "stretch",
                  alignItems: "center",
                  paddingVertical: 14,
                  backgroundColor: "rgba(16,185,129,0.09)",
                  borderColor: "rgba(16,185,129,0.28)",
                },
              ]}
            >
              <Text style={styles.generalStatLabel}>إجمالي دخل عام</Text>
              <Text style={[styles.generalStatValue, { color: INCOME_COLOR, marginTop: 4 }]}>
                {fmt(totalAllIncome)}
              </Text>
              <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
            </View>
          ) : null}
          <View style={styles.generalStatsGrid}>
            {GENERAL_INCOME_CATS.map((cat) => {
              const total = perCatTotals[cat];
              return total > 0 ? (
                <View
                  key={cat}
                  style={[
                    styles.card,
                    {
                      backgroundColor: "rgba(16,185,129,0.07)",
                      borderColor: "rgba(16,185,129,0.2)",
                      alignItems: "center",
                      minWidth: 150,
                      flex: 1,
                    },
                  ]}
                >
                  <Text style={styles.generalStatLabel}>{cat}</Text>
                  <Text style={[styles.generalStatValue, { color: INCOME_COLOR }]}>{fmt(total)}</Text>
                  <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
                </View>
              ) : null;
            })}
            {uncategorizedIncome > 0 ? (
              <View
                key="__uncategorized_income"
                style={[
                  styles.card,
                  {
                    backgroundColor: "rgba(245,158,11,0.08)",
                    borderColor: "rgba(245,158,11,0.25)",
                    alignItems: "center",
                    minWidth: 150,
                    flex: 1,
                  },
                ]}
              >
                <Text style={styles.generalStatLabel}>فئات غير مدرجة</Text>
                <Text style={[styles.generalStatValue, { color: "#f59e0b" }]}>{fmt(uncategorizedIncome)}</Text>
                <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
              </View>
            ) : null}
          </View>
          {generalTxs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💵</Text>
              <Text style={styles.emptyText}>لا يوجد دخل عام في السنة المالية {activeFiscalYearLabel}</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {[...generalTxs].reverse().map((t) => {
                const noteText = (t.note || "").trim();
                return (
                <View key={t.id} style={[styles.txItem, { borderColor: "rgba(16,185,129,0.2)" }]}>
                  <Text style={styles.txIcon}>💵</Text>
                  <View style={styles.txContent}>
                    <View style={styles.txTags}>
                      <View style={[styles.tag, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                        <Text style={[styles.tagText, { color: INCOME_COLOR }]}>{t.cat}</Text>
                      </View>
                    </View>
                    {noteText ? (
                      <Text style={[styles.txNote, { marginTop: 6, alignSelf: "flex-start" }]}>{noteText}</Text>
                    ) : null}
                    <Text style={styles.txDate}>{t.date}</Text>
                  </View>
                  <Text style={[styles.txAmount, { color: INCOME_COLOR }]}>
                    +{fmt(t.amount)} {CURRENCY}
                  </Text>
                  <TouchableOpacity style={styles.txDeleteBtn} onPress={() => deleteGeneralTx(t.id)}>
                    <Text style={styles.txDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </View>
          )}
        </View>
      </ScreenLayout>
      <CustomModal visible={modal === "addGeneralIncome"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>💵 دخل عام — {activeFiscalYearLabel}</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
          <FormTextInput
            styles={styles}
            placeholder="0"
            placeholderTextColor="#64748b"
            value={form.amount?.toString() || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>الفئة</Text>
          <View style={styles.optionsGrid}>
            {GENERAL_INCOME_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && [styles.optionBtnActive, { backgroundColor: INCOME_COLOR }],
                ]}
                onPress={() => setForm((p) => ({ ...p, cat }))}
              >
                <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
          <FormTextInput
            styles={styles}
            placeholder=""
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <FormDateField
          styles={styles}
          value={form.date}
          onChangeValue={(v) => setForm((p) => ({ ...p, date: v }))}
          active={modal === "addGeneralIncome"}
        />
        <TouchableOpacity
          style={[styles.btn, styles.btnGeneralIncome, styles.modalSaveBtn]}
          onPress={saveGeneralIncome}
        >
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
