import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler } from "react-native";
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

const OptionChip = React.memo(function OptionChip({ label, selected, onPress, activeColor }) {
  return (
    <TouchableOpacity
      style={[styles.optionBtn, selected && [styles.optionBtnActive, activeColor ? { backgroundColor: activeColor } : null]]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.optionBtnText, selected && styles.optionBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
});

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

/** Local form state so category taps don't re-render the whole General screen via AppContext.form. */
function AddGeneralExpenseForm({ visible, initialRef, fiscalYearLabel, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm({ ...(initialRef.current || {}) });
    setFormErrors({});
    setSaving(false);
  }, [visible, initialRef]);

  const saveGeneral = async () => {
    if (saving) return;
    const err = {};
    if (parsePositiveAmount(form.amount) == null) err.amount = FORM_MSG.amount;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
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
      await upsertGeneralTx(tx);
      await onSaved?.(fiscalYearId);
      onClose?.();
    } catch (_) {
      setFormErrors({ submit: "تعذر حفظ المصروف" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomModal
      visible={visible}
      onClose={() => {
        setFormErrors({});
        onClose?.();
      }}
    >
      <Text style={styles.modalTitle}>🏢 مصروف عام — {fiscalYearLabel}</Text>
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
            <OptionChip
              key={cat}
              label={cat}
              selected={form.cat === cat}
              activeColor="#f43f5e"
              onPress={() => setForm((p) => ({ ...p, cat }))}
            />
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
        active={visible}
        error={formErrors.date}
      />
      {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
      <TouchableOpacity
        style={[styles.btn, styles.btnGeneral, styles.modalSaveBtn, saving && { opacity: 0.6 }]}
        onPress={saveGeneral}
        disabled={saving}
      >
        <Text style={styles.btnText}>حفظ ✓</Text>
      </TouchableOpacity>
    </CustomModal>
  );
}

export default function General() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal } = useApp();
  const addGeneralInitialRef = useRef({});

  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);
  const [expenseTotalsByCat, setExpenseTotalsByCat] = useState({});
  const [categoryTotalsFullFy, setCategoryTotalsFullFy] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [txPage, setTxPage] = useState(0);
  const [selectedExpenseCat, setSelectedExpenseCat] = useState(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateFiltersExpanded, setDateFiltersExpanded] = useState(false);
  const listFetchGen = useRef(0);
  const lastExpenseListFyRef = useRef(null);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);

  const expenseDateRange = useMemo(
    () => normalizeExpenseDateRange(filterDateFrom, filterDateTo),
    [filterDateFrom, filterDateTo]
  );

  // reset pagination when filters change
  useEffect(() => {
    setTxPage(0);
  }, [
    selectedExpenseCat,
    expenseDateRange.active,
    expenseDateRange.dateFrom,
    expenseDateRange.dateTo,
    activeFiscalYearId,
  ]);

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
      // reset to the first page so pagination stays consistent
      setTxPage(0);
      setRowMenuId(null);
      setRowMenuPos(null);
    } catch (_) {}
  };

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
      setTxPage(0);
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
    setRowMenuId(null);
    setRowMenuPos(null);
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
        txPage * GENERAL_EXPENSE_PAGE_SIZE,
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
    txPage,
  ]);

  const refreshAfterSave = async (fiscalYearId) => {
    if (fiscalYearId == null) return;
    setTxPage(0);
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
  };

  const closeAddGeneral = () => setModal(null);

  const fyGeneralTxs = generalTxs || [];

  const closeRowMenu = () => {
    setRowMenuId(null);
    setRowMenuPos(null);
  };

  useEffect(() => {
    if (rowMenuId == null) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeRowMenu();
      return true;
    });
    return () => sub.remove();
  }, [rowMenuId]);

  const openRowMenu = (tx) => {
    if (!tx) return;
    if (String(rowMenuId) === String(tx.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[tx.id];
    const root = listRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(tx.id);
      setRowMenuPos({ x, y, w, h, tx });
    };
    requestAnimationFrame(() => {
      if (!btn || typeof btn.measureInWindow !== "function") {
        place(12, 80, 32, 32);
        return;
      }
      if (root && typeof root.measureInWindow === "function") {
        root.measureInWindow((rx, ry) => {
          btn.measureInWindow((bx, by, bw, bh) => {
            place(bx - (rx || 0), by - (ry || 0), bw, bh);
          });
        });
        return;
      }
      btn.measureInWindow((x, y, w, h) => place(x, y, w, h));
    });
  };

  const openEditGeneralTx = (t) => {
    if (!t) return;
    addGeneralInitialRef.current = {
      editTxId: t.id,
      amount: String(t.amount ?? ""),
      cat: t.cat || GENERAL_EXPENSE_CATS[0],
      note: t.note || "",
      date: t.date || "",
    };
    setModal("addGeneral");
  };

  const openAddGeneral = () => {
    addGeneralInitialRef.current = {
      cat: GENERAL_EXPENSE_CATS[0],
      date: new Date().toISOString().split("T")[0],
    };
    setModal("addGeneral");
  };

  const totalFilteredAmount =
    selectedExpenseCat != null
      ? Number(expenseTotalsByCat[selectedExpenseCat]) || 0
      : Object.values(expenseTotalsByCat || {}).reduce(
          (s, v) => s + (Number(v) || 0),
          0
        );

  return (
    <View style={{ flex: 1 }} ref={listRootRef}>
      <ScreenLayout>
        <View style={styles.generalView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnGeneral, { marginBottom: 10, alignSelf: "flex-start" }]}
            onPress={openAddGeneral}
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
                <View style={styles.stockTableCard}>
                  {fyGeneralTxs.length === 0 ? (
                    expenseListFilterActive ? (
                      <View style={[styles.emptyState, { paddingVertical: 24 }]}>
                        <Text style={styles.emptyText}>
                          لا توجد مصروفات ضمن الفلاتر المحددة (الفئة أو الفترة).
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🏢</Text>
                        <Text style={styles.emptyText}>
                          لا توجد مصروفات عامة في السنة المالية {activeFiscalYearLabel}
                        </Text>
                      </View>
                    )
                  ) : (
                    <>
                      <View style={styles.stockTableHeader}>
                        <View style={[styles.stockTableCol, styles.stockTableColName]}>
                          <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                            الفئة
                          </Text>
                        </View>
                        <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                          <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                            التاريخ
                          </Text>
                        </View>
                        <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                          <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                            المبلغ
                          </Text>
                        </View>
                        <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                          <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                            {" "}
                          </Text>
                        </View>
                      </View>
                      {fyGeneralTxs.map((t, index) => {
                        const isLast = index === fyGeneralTxs.length - 1;
                        return (
                          <View
                            key={t.id}
                            style={[
                              styles.stockTableRow,
                              index % 2 === 1 && styles.stockTableRowAlt,
                              isLast && txPage <= 0 && styles.stockTableRowLast,
                            ]}
                          >
                            <View style={[styles.stockTableCol, styles.stockTableColName]}>
                              <Text style={[styles.stockTableCellName, { color: "#f43f5e" }]} numberOfLines={2}>
                                {t.cat}
                              </Text>
                              {t.note ? (
                                <Text style={styles.stockTableCellSub} numberOfLines={1}>
                                  {t.note}
                                </Text>
                              ) : null}
                            </View>
                            <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                              <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                                {t.date || "—"}
                              </Text>
                            </View>
                            <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                              <Text
                                style={[
                                  styles.stockTableCell,
                                  styles.stockTableCellCenter,
                                  { color: "#f43f5e" },
                                ]}
                                numberOfLines={1}
                              >
                                -{fmt(t.amount)} {CURRENCY}
                              </Text>
                            </View>
                            <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                              <View
                                collapsable={false}
                                ref={(el) => {
                                  if (el) menuBtnRefs.current[t.id] = el;
                                  else delete menuBtnRefs.current[t.id];
                                }}
                              >
                                <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(t)}>
                                  <Text style={styles.stockMenuBtnText}>⋮</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      <View style={styles.stockTableFooter}>
                        <View style={[styles.stockTableCol, { flex: 1, minWidth: 0 }]}>
                          <Text style={[styles.stockTableCellSub, styles.stockTableCellCenter]}>الإجمالي</Text>
                          <Text
                            style={[
                              styles.stockTableFooterText,
                              styles.stockTableCellCenter,
                              { color: "#f43f5e", width: "100%" },
                            ]}
                            numberOfLines={1}
                          >
                            {fmt(totalFilteredAmount)} {CURRENCY}
                          </Text>
                        </View>
                        <View style={[styles.stockTableCol, { flex: 1, minWidth: 0 }]} />
                        <View style={[styles.stockTableCol, { flex: 1, minWidth: 0 }]} />
                        <View style={[styles.stockTableCol, styles.stockTableColMenu]} />
                      </View>
                      {hasAnyExpense ? (
                        <View style={styles.stockTablePager}>
                          <TouchableOpacity
                            style={[
                              styles.stockTablePagerBtn,
                              txPage === 0 && styles.stockTablePagerBtnDisabled,
                            ]}
                            onPress={() => setTxPage((p) => Math.max(0, p - 1))}
                            disabled={txPage === 0}
                          >
                            <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                          </TouchableOpacity>
                          <Text style={styles.stockTablePagerInfo}>صفحة {txPage + 1}</Text>
                          <TouchableOpacity
                            style={[
                              styles.stockTablePagerBtn,
                              (!hasMore || fyGeneralTxs.length === 0) && styles.stockTablePagerBtnDisabled,
                            ]}
                            onPress={() => setTxPage((p) => p + 1)}
                            disabled={!hasMore || fyGeneralTxs.length === 0}
                          >
                            <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScreenLayout>
      {rowMenuPos?.tx ? (
        <View style={rowMenuOverlayStyles.layer} pointerEvents="box-none">
          <Pressable style={rowMenuOverlayStyles.backdrop} onPress={closeRowMenu} />
          <View
            style={[
              styles.stockRowMenu,
              {
                top: rowMenuPos.y + rowMenuPos.h + 4,
                left: rowMenuPos.x,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const tx = rowMenuPos.tx;
                closeRowMenu();
                openEditGeneralTx(tx);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const tx = rowMenuPos.tx;
                closeRowMenu();
                deleteGeneralTx(tx.id);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#f43f5e" }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <AddGeneralExpenseForm
        visible={modal === "addGeneral"}
        initialRef={addGeneralInitialRef}
        fiscalYearLabel={activeFiscalYearLabel}
        onClose={closeAddGeneral}
        onSaved={refreshAfterSave}
      />
    </View>
  );
}

const rowMenuOverlayStyles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    direction: "ltr",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
});
