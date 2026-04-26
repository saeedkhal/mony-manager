import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import {
  getGeneralExpenseTxsPage,
  getGeneralExpenseCategoryTotals,
  deleteGeneralTx as dbDeleteGeneralTx,
  getActiveFiscalYear,
  getActiveFiscalYearId,
  upsertGeneralTx,
} from "../utils/db";
import { CURRENCY, GENERAL_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";

const GENERAL_EXPENSE_PAGE_SIZE = 5;

function normalizeExpenseDateRange(fromRaw, toRaw) {
  const f = trimmed(fromRaw);
  const t = trimmed(toRaw);
  const vf = f && isValidDateYmd(f) ? f : null;
  const vt = t && isValidDateYmd(t) ? t : null;
  let dateFrom = vf;
  let dateTo = vt;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const x = dateFrom;
    dateFrom = dateTo;
    dateTo = x;
  }
  const active = dateFrom != null || dateTo != null;
  return { dateFrom, dateTo, active };
}

export default function General() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);
  const [expenseTotalsByCat, setExpenseTotalsByCat] = useState({});
  const [categoryTotalsFullFy, setCategoryTotalsFullFy] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedExpenseCat, setSelectedExpenseCat] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateFiltersExpanded, setDateFiltersExpanded] = useState(false);
  const listFetchGen = useRef(0);
  const txsRef = useRef([]);
  const lastExpenseListFyRef = useRef(null);

  const expenseDateRange = useMemo(
    () => normalizeExpenseDateRange(filterDateFrom, filterDateTo),
    [filterDateFrom, filterDateTo]
  );

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
      setGeneralTxs((prev) => prev.filter((t) => String(t.id) !== String(id)));
      if (activeFiscalYearId != null) {
        const full = await getGeneralExpenseCategoryTotals(activeFiscalYearId);
        setCategoryTotalsFullFy(full && typeof full === "object" ? full : {});
        if (expenseDateRange.active) {
          const ranged = await getGeneralExpenseCategoryTotals(activeFiscalYearId, {
            dateFrom: expenseDateRange.dateFrom,
            dateTo: expenseDateRange.dateTo,
          });
          setExpenseTotalsByCat(ranged && typeof ranged === "object" ? ranged : {});
        } else {
          setExpenseTotalsByCat(full && typeof full === "object" ? full : {});
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    txsRef.current = generalTxs;
  }, [generalTxs]);

  const hasAnyExpense = useMemo(
    () => Object.values(categoryTotalsFullFy).some((v) => (Number(v) || 0) > 0),
    [categoryTotalsFullFy]
  );

  const expenseListFilterActive =
    selectedExpenseCat != null || expenseDateRange.active;

  useEffect(() => {
    if (!loaded || !isFocused || activeFiscalYearId == null) return;
    const fyChanged = lastExpenseListFyRef.current !== activeFiscalYearId;
    if (fyChanged) {
      lastExpenseListFyRef.current = activeFiscalYearId;
      setDateFiltersExpanded(false);
      let defer = false;
      if (selectedExpenseCat != null) {
        setSelectedExpenseCat(null);
        defer = true;
      }
      if (trimmed(filterDateFrom) !== "" || trimmed(filterDateTo) !== "") {
        setFilterDateFrom("");
        setFilterDateTo("");
        defer = true;
      }
      if (defer) return;
    }
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    setGeneralTxs([]);
    setHasMore(true);
    setExpenseTotalsByCat({});
    setCategoryTotalsFullFy({});
    const rangeArg =
      expenseDateRange.active
        ? { dateFrom: expenseDateRange.dateFrom, dateTo: expenseDateRange.dateTo }
        : null;
    Promise.all([
      getGeneralExpenseTxsPage(
        activeFiscalYearId,
        GENERAL_EXPENSE_PAGE_SIZE,
        0,
        selectedExpenseCat,
        expenseDateRange.dateFrom,
        expenseDateRange.dateTo
      ),
      getGeneralExpenseCategoryTotals(activeFiscalYearId),
      expenseDateRange.active
        ? getGeneralExpenseCategoryTotals(activeFiscalYearId, rangeArg)
        : Promise.resolve(null),
    ])
      .then(([{ txs: first, hasMore: hm }, totalsFull, totalsDisplay]) => {
        if (cancelled || gen !== listFetchGen.current) return;
        setGeneralTxs(first || []);
        setHasMore(!!hm);
        const full = totalsFull && typeof totalsFull === "object" ? totalsFull : {};
        setCategoryTotalsFullFy(full);
        setExpenseTotalsByCat(
          totalsDisplay != null && typeof totalsDisplay === "object" ? totalsDisplay : full
        );
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setGeneralTxs([]);
        setHasMore(false);
        setExpenseTotalsByCat({});
        setCategoryTotalsFullFy({});
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    loaded,
    isFocused,
    activeFiscalYearId,
    selectedExpenseCat,
    filterDateFrom,
    filterDateTo,
    expenseDateRange.dateFrom,
    expenseDateRange.dateTo,
    expenseDateRange.active,
  ]);

  const loadMoreExpenseTxs = useCallback(async () => {
    if (!hasMore || loadingMore || loading || activeFiscalYearId == null) return;
    const gen = listFetchGen.current;
    const offset = txsRef.current.length;
    setLoadingMore(true);
    try {
      const { txs: next, hasMore: hm } = await getGeneralExpenseTxsPage(
        activeFiscalYearId,
        GENERAL_EXPENSE_PAGE_SIZE,
        offset,
        selectedExpenseCat,
        expenseDateRange.dateFrom,
        expenseDateRange.dateTo
      );
      if (gen !== listFetchGen.current) return;
      setGeneralTxs((prev) => [...prev, ...(next || [])]);
      setHasMore(!!hm);
    } catch (_) {
      if (gen === listFetchGen.current) setHasMore(false);
    } finally {
      if (gen === listFetchGen.current) setLoadingMore(false);
    }
  }, [
    hasMore,
    loadingMore,
    loading,
    activeFiscalYearId,
    selectedExpenseCat,
    expenseDateRange.dateFrom,
    expenseDateRange.dateTo,
  ]);

  const onScrollGeneral = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreExpenseTxs();
      }
    },
    [loadMoreExpenseTxs]
  );

  const saveGeneral = async () => {
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
      cat: form.cat || GENERAL_EXPENSE_CATS[0],
      note: form.note || "",
      date,
      fiscalYearId: fiscalYearId ?? null,
      txKind: "expense",
    };
    try {
      await upsertGeneralTx(tx);
      if (fiscalYearId != null) {
        listFetchGen.current += 1;
        const gen = listFetchGen.current;
        const rangeArg =
          expenseDateRange.active
            ? { dateFrom: expenseDateRange.dateFrom, dateTo: expenseDateRange.dateTo }
            : null;
        const [page, totalsFull, totalsDisplay] = await Promise.all([
          getGeneralExpenseTxsPage(
            fiscalYearId,
            GENERAL_EXPENSE_PAGE_SIZE,
            0,
            selectedExpenseCat,
            expenseDateRange.dateFrom,
            expenseDateRange.dateTo
          ),
          getGeneralExpenseCategoryTotals(fiscalYearId),
          expenseDateRange.active
            ? getGeneralExpenseCategoryTotals(fiscalYearId, rangeArg)
            : Promise.resolve(null),
        ]);
        if (gen === listFetchGen.current) {
          setGeneralTxs(page.txs || []);
          setHasMore(!!page.hasMore);
          const full = totalsFull && typeof totalsFull === "object" ? totalsFull : {};
          setCategoryTotalsFullFy(full);
          setExpenseTotalsByCat(
            totalsDisplay != null && typeof totalsDisplay === "object" ? totalsDisplay : full
          );
        }
      }
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const fyGeneralTxs = generalTxs || [];

  return (
    <>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollGeneral, scrollEventThrottle: 400 }}>
        <View style={styles.generalView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGeneral, { marginBottom: 10, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({
                cat: GENERAL_EXPENSE_CATS[0],
                date: new Date().toISOString().split("T")[0],
              });
              setModal("addGeneral");
            }}
          >
            <Text style={styles.btnText}>+ مصروف عام</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: "rgba(15,23,42,0.55)",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(244,63,94,0.18)",
              }}
            >
              <TouchableOpacity
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                activeOpacity={0.7}
                onPress={() => setDateFiltersExpanded((v) => !v)}
              >
                <Text style={{ fontSize: 12, color: "#64748b" }}>📅</Text>
                <Text
                  style={{ fontSize: 13, color: "#e2e8f0", flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {expenseDateRange.active
                    ? expenseDateRange.dateFrom && expenseDateRange.dateTo
                      ? `${expenseDateRange.dateFrom} — ${expenseDateRange.dateTo}`
                      : expenseDateRange.dateFrom
                        ? `من ${expenseDateRange.dateFrom}`
                        : `حتى ${expenseDateRange.dateTo}`
                    : "فلترة بالتاريخ"}
                </Text>
                <Text style={{ fontSize: 11, color: "#64748b" }}>
                  {dateFiltersExpanded ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
              {expenseDateRange.active ? (
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => {
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  }}
                >
                  <Text style={{ color: "#f43f5e", fontSize: 12 }}>مسح</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {dateFiltersExpanded ? (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <FormDateField
                      styles={styles}
                      label="من"
                      value={filterDateFrom}
                      onChangeValue={setFilterDateFrom}
                      active={modal !== "addGeneral"}
                      compact
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <FormDateField
                      styles={styles}
                      label="إلى"
                      value={filterDateTo}
                      onChangeValue={setFilterDateTo}
                      active={modal !== "addGeneral"}
                      compact
                    />
                  </View>
                </View>
                {(trimmed(filterDateFrom) !== "" || trimmed(filterDateTo) !== "") &&
                !expenseDateRange.active ? (
                  <TouchableOpacity
                    onPress={() => {
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }}
                    style={{ alignSelf: "flex-start", marginTop: 2 }}
                  >
                    <Text style={{ color: "#f43f5e", fontSize: 12 }}>مسح الحقول</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
          {loading && fyGeneralTxs.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color="#f43f5e" size="large" />
              <Text style={[styles.loadingText, { marginTop: 12 }]}>جاري التحميل...</Text>
            </View>
          ) : (
            <>
              <View style={styles.generalStatsGrid}>
                {GENERAL_EXPENSE_CATS.map((cat) => {
                  const total = Number(expenseTotalsByCat[cat]) || 0;
                  const selected = selectedExpenseCat === cat;
                  return total > 0 ? (
                    <TouchableOpacity
                      key={cat}
                      activeOpacity={0.75}
                      onPress={() =>
                        setSelectedExpenseCat((prev) => (prev === cat ? null : cat))
                      }
                      style={[
                        styles.card,
                        {
                          backgroundColor: "rgba(244,63,94,0.07)",
                          borderColor: selected ? "#f43f5e" : "rgba(244,63,94,0.2)",
                          borderWidth: selected ? 2 : 1,
                          alignItems: "center",
                          minWidth: 150,
                          flex: 1,
                        },
                      ]}
                    >
                      <Text style={styles.generalStatLabel}>{cat}</Text>
                      <Text style={styles.generalStatValue}>{fmt(total)}</Text>
                      <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
                    </TouchableOpacity>
                  ) : null;
                })}
              </View>
              {!hasAnyExpense ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🏢</Text>
                  <Text style={styles.emptyText}>
                    لا توجد مصروفات عامة في السنة المالية {activeFiscalYearLabel}
                  </Text>
                </View>
              ) : (
                <View style={styles.txList}>
                  {hasAnyExpense &&
                  fyGeneralTxs.length === 0 &&
                  !loadingMore &&
                  expenseListFilterActive ? (
                    <View style={[styles.emptyState, { paddingVertical: 24 }]}>
                      <Text style={styles.emptyText}>
                        لا توجد مصروفات ضمن الفلاتر المحددة (الفئة أو الفترة).
                      </Text>
                    </View>
                  ) : null}
                  {fyGeneralTxs.map((t) => (
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
                      <TouchableOpacity style={styles.txDeleteBtn} onPress={() => deleteGeneralTx(t.id)}>
                        <Text style={styles.txDeleteBtnText}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {loadingMore ? (
                    <View style={{ paddingVertical: 20, alignItems: "center" }}>
                      <ActivityIndicator color="#f43f5e" />
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
        visible={modal === "addGeneral"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
        }}
      >
        <Text style={styles.modalTitle}>🏢 مصروف عام — {activeFiscalYearLabel}</Text>
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
          active={modal === "addGeneral"}
          error={formErrors.date}
        />
        <TouchableOpacity style={[styles.btn, styles.btnGeneral, styles.modalSaveBtn]} onPress={saveGeneral}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
