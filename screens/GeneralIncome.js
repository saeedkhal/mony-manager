import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import {
  getGeneralIncomeTxsPage,
  getGeneralIncomeTotalAmount,
  deleteGeneralTx as dbDeleteGeneralTx,
  getActiveFiscalYear,
  getActiveFiscalYearId,
  upsertGeneralTx,
} from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";

const INCOME_COLOR = "#10b981";
const GENERAL_INCOME_PAGE_SIZE = 5;

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
      const removed = generalTxs.find((t) => String(t.id) === String(id));
      setGeneralTxs((prev) => prev.filter((t) => String(t.id) !== String(id)));
      if (removed != null) {
        setTotalIncome((prev) => Math.max(0, prev - txAmount(removed)));
      } else if (activeFiscalYearId != null) {
        const t = await getGeneralIncomeTotalAmount(activeFiscalYearId);
        setTotalIncome(Number(t) || 0);
      }
    } catch (_) {}
  };
  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const listFetchGen = useRef(0);
  const txsRef = useRef([]);

  useEffect(() => {
    txsRef.current = generalTxs;
  }, [generalTxs]);

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    setGeneralTxs([]);
    setHasMore(true);
    setTotalIncome(0);
    Promise.all([
      getGeneralIncomeTxsPage(activeFiscalYearId, GENERAL_INCOME_PAGE_SIZE, 0),
      getGeneralIncomeTotalAmount(activeFiscalYearId),
    ])
      .then(([{ txs: first, hasMore: hm }, total]) => {
        if (cancelled || gen !== listFetchGen.current) return;
        setGeneralTxs(first || []);
        setHasMore(!!hm);
        setTotalIncome(Number(total) || 0);
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setGeneralTxs([]);
        setHasMore(false);
        setTotalIncome(0);
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, activeFiscalYearId]);

  const loadMoreIncomeTxs = useCallback(async () => {
    if (!hasMore || loadingMore || loading || activeFiscalYearId == null) return;
    const gen = listFetchGen.current;
    const offset = txsRef.current.length;
    setLoadingMore(true);
    try {
      const { txs: next, hasMore: hm } = await getGeneralIncomeTxsPage(
        activeFiscalYearId,
        GENERAL_INCOME_PAGE_SIZE,
        offset
      );
      if (gen !== listFetchGen.current) return;
      setGeneralTxs((prev) => [...prev, ...(next || [])]);
      setHasMore(!!hm);
    } catch (_) {
      if (gen === listFetchGen.current) setHasMore(false);
    } finally {
      if (gen === listFetchGen.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, activeFiscalYearId]);

  const onScrollIncome = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreIncomeTxs();
      }
    },
    [loadMoreIncomeTxs]
  );

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
        listFetchGen.current += 1;
        const gen = listFetchGen.current;
        const [page, total] = await Promise.all([
          getGeneralIncomeTxsPage(fiscalYearId, GENERAL_INCOME_PAGE_SIZE, 0),
          getGeneralIncomeTotalAmount(fiscalYearId),
        ]);
        if (gen === listFetchGen.current) {
          setGeneralTxs(page.txs || []);
          setHasMore(!!page.hasMore);
          setTotalIncome(Number(total) || 0);
        }
      }
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  return (
    <>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollIncome, scrollEventThrottle: 400 }}>
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
          {loading && generalTxs.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={INCOME_COLOR} size="large" />
              <Text style={[styles.loadingText, { marginTop: 12 }]}>جاري التحميل...</Text>
            </View>
          ) : (
            <>
              {totalIncome > 0 ? (
                <View
                  style={[
                    styles.card,
                    {
                      alignSelf: "stretch",
                      alignItems: "center",
                      paddingVertical: 14,
                      marginBottom: 16,
                      backgroundColor: "rgba(16,185,129,0.09)",
                      borderColor: "rgba(16,185,129,0.28)",
                    },
                  ]}
                >
                  <Text style={styles.generalStatLabel}>إجمالي دخل عام</Text>
                  <Text style={[styles.generalStatValue, { color: INCOME_COLOR, marginTop: 4 }]}>
                    {fmt(totalIncome)}
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
                  {generalTxs.map((t) => {
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
                  {loadingMore ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <ActivityIndicator color={INCOME_COLOR} />
                      <Text style={[styles.loadingText, { marginTop: 8, fontSize: 13 }]}>جاري التحميل...</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </>
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
