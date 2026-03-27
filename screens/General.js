import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { getGeneralTxs, deleteGeneralTx as dbDeleteGeneralTx, getActiveFiscalYear, getActiveFiscalYearId, upsertGeneralTx } from "../utils/db";
import { CURRENCY, GENERAL_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";

export default function General() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
    } catch (_) {}
  };
  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    let cancelled = false;
    getGeneralTxs(activeFiscalYearId)
      .then((g) => { if (!cancelled) setGeneralTxs(g || []); })
      .catch(() => { if (!cancelled) setGeneralTxs([]); });
    return () => { cancelled = true; };
  }, [loaded, isFocused, activeFiscalYearId, modal]);

  const saveGeneral = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    await getActiveFiscalYear();
    const fiscalYearId = await getActiveFiscalYearId();
    const tx = {
      id: form.editTxId || Date.now(),
      amount: Number(form.amount),
      cat: form.cat || GENERAL_EXPENSE_CATS[0],
      note: form.note || "",
      date,
      fiscalYearId: fiscalYearId ?? null,
    };
    try {
      await upsertGeneralTx(tx);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const fyGeneralTxs = generalTxs || [];

  return (
    <>
      <ScreenLayout>
        <View style={styles.generalView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGeneral, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setForm({
                cat: GENERAL_EXPENSE_CATS[0],
                date: new Date().toISOString().split("T")[0],
              });
              setModal("addGeneral");
            }}
          >
            <Text style={styles.btnText}>+ مصروف عام</Text>
          </TouchableOpacity>
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
                لا توجد مصروفات عامة في السنة المالية {activeFiscalYearLabel}
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
                    onPress={() => deleteGeneralTx(t.id)}
                  >
                    <Text style={styles.txDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScreenLayout>
      <CustomModal visible={modal === "addGeneral"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>🏢 مصروف عام — {activeFiscalYearLabel}</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
          <TextInput
            style={styles.input}
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
            {GENERAL_EXPENSE_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && [styles.optionBtnActive, { backgroundColor: "#f43f5e" }],
                ]}
                onPress={() => setForm((p) => ({ ...p, cat }))}
              >
                <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            value={form.date || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnGeneral, styles.modalSaveBtn]} onPress={saveGeneral}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
