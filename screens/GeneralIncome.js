import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { getGeneralTxs, deleteGeneralTx as dbDeleteGeneralTx, getActiveFiscalYear, getActiveFiscalYearId, upsertGeneralTx } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";

const INCOME_COLOR = "#10b981";

function txAmount(t) {
  const n = Number(t.amount);
  return Number.isFinite(n) ? n : 0;
}

export default function GeneralIncome() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

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
    const err = {};
    if (parsePositiveAmount(form.amount) == null) err.amount = FORM_MSG.amount;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setFormErrors({});
    await getActiveFiscalYear();
    const fiscalYearId = await getActiveFiscalYearId();
    const tx = {
      id: form.editTxId || Date.now(),
      amount: parsePositiveAmount(form.amount),
      cat: "",
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

  const totalAllIncome = useMemo(
    () => generalTxs.reduce((sum, t) => sum + txAmount(t), 0),
    [generalTxs]
  );

  return (
    <>
      <ScreenLayout>
        <View style={styles.generalView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGeneralIncome, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({
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
      <CustomModal
        visible={modal === "addGeneralIncome"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
        }}
      >
        <Text style={styles.modalTitle}>💵 دخل عام — {activeFiscalYearLabel}</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
          <FormTextInput
            styles={styles}
            placeholder="0"
            placeholderTextColor="#64748b"
            value={form.amount?.toString() || ""}
            onChangeText={(text) => {
              setFormErrors((e) => ({ ...e, amount: undefined }));
              setForm((p) => ({ ...p, amount: text }));
            }}
            keyboardType="numeric"
            error={formErrors.amount}
          />
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
          onChangeValue={(v) => {
            setFormErrors((e) => ({ ...e, date: undefined }));
            setForm((p) => ({ ...p, date: v }));
          }}
          active={modal === "addGeneralIncome"}
          error={formErrors.date}
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
