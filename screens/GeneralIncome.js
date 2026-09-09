import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler } from "react-native";
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

export default function GeneralIncome() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
      setTxPage(0);
      setRowMenuId(null);
      setRowMenuPos(null);
    } catch (_) {}
  };
  const isFocused = useIsFocused();
  const [generalTxs, setGeneralTxs] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [txPage, setTxPage] = useState(0);
  const listFetchGen = useRef(0);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);

  useEffect(() => {
    setTxPage(0);
  }, [activeFiscalYearId]);

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
      getGeneralIncomeTxsPage(
        activeFiscalYearId,
        GENERAL_INCOME_PAGE_SIZE,
        txPage * GENERAL_INCOME_PAGE_SIZE
      ),
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
  }, [loaded, isFocused, activeFiscalYearId, txPage]);

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
        setTxPage(0);
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

  const openEditGeneralIncomeTx = (t) => {
    if (!t) return;
    setFormErrors({});
    setForm({
      editTxId: t.id,
      amount: String(t.amount ?? ""),
      cat: "",
      note: t.note || "",
      date: t.date || "",
    });
    setModal("addGeneralIncome");
  };

  return (
    <View style={{ flex: 1 }} ref={listRootRef}>
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
                <View style={styles.stockTableCard}>
                  <View style={styles.stockTableHeader}>
                    <View style={[styles.stockTableCol, styles.stockTableColName]}>
                      <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                        ملاحظة
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

                  {generalTxs.map((t, index) => {
                    const noteText = (t.note || "").trim();
                    const isLast = index === generalTxs.length - 1;
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
                          <Text
                            style={[styles.stockTableCellName, { color: INCOME_COLOR }]}
                            numberOfLines={2}
                          >
                            {noteText || "—"}
                          </Text>
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
                              { color: INCOME_COLOR },
                            ]}
                            numberOfLines={1}
                          >
                            +{fmt(t.amount)} {CURRENCY}
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
                          { color: INCOME_COLOR, width: "100%" },
                        ]}
                        numberOfLines={1}
                      >
                        {fmt(totalIncome)} {CURRENCY}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, { flex: 1, minWidth: 0 }]} />
                    <View style={[styles.stockTableCol, { flex: 1, minWidth: 0 }]} />
                    <View style={[styles.stockTableCol, styles.stockTableColMenu]} />
                  </View>

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
                        !hasMore && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => setTxPage((p) => p + 1)}
                      disabled={!hasMore}
                    >
                      <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                    </TouchableOpacity>
                  </View>
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
                openEditGeneralIncomeTx(tx);
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
