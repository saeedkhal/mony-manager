import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import {
  getStockItemsWithBalance,
  getStockMovementsPage,
  getSuppliers,
  getClients,
  recordStockPurchase,
  upsertStockItem,
  deleteStockMovement,
} from "../utils/db";
import { CURRENCY, STOCK_UNITS, CLIENT_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import { getStockUnitLabel } from "../utils/stockHelpers";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";

const STOCK_MOVEMENTS_PAGE_SIZE = 15;

export default function Warehouse() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const isFocused = useIsFocused();
  const [formErrors, setFormErrors] = useState({});
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [movementsLoadingMore, setMovementsLoadingMore] = useState(false);
  const movementsRef = useRef([]);

  useEffect(() => {
    movementsRef.current = movements;
  }, [movements]);

  const loadMovementsFirstPage = useCallback(async () => {
    if (activeFiscalYearId == null) {
      setMovements([]);
      setMovementsHasMore(false);
      return;
    }
    const { movements: first, hasMore } = await getStockMovementsPage(
      activeFiscalYearId,
      STOCK_MOVEMENTS_PAGE_SIZE,
      0
    );
    setMovements(first || []);
    setMovementsHasMore(!!hasMore);
  }, [activeFiscalYearId]);

  const refetch = useCallback(async () => {
    if (!loaded) return;
    const [bal, sup, cl] = await Promise.all([
      getStockItemsWithBalance(),
      getSuppliers(),
      getClients(),
    ]);
    setBalances(bal || []);
    setSuppliers(sup || []);
    setClients(cl || []);
    await loadMovementsFirstPage();
  }, [loaded, activeFiscalYearId, loadMovementsFirstPage]);

  const loadMoreMovements = useCallback(async () => {
    if (!movementsHasMore || movementsLoadingMore || loading || activeFiscalYearId == null) return;
    setMovementsLoadingMore(true);
    try {
      const offset = movementsRef.current.length;
      const { movements: next, hasMore } = await getStockMovementsPage(
        activeFiscalYearId,
        STOCK_MOVEMENTS_PAGE_SIZE,
        offset
      );
      setMovements((prev) => [...prev, ...(next || [])]);
      setMovementsHasMore(!!hasMore);
    } catch (_) {
      setMovementsHasMore(false);
    } finally {
      setMovementsLoadingMore(false);
    }
  }, [movementsHasMore, movementsLoadingMore, loading, activeFiscalYearId]);

  const onScrollWarehouse = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreMovements();
      }
    },
    [loadMoreMovements]
  );

  useEffect(() => {
    if (!loaded || !isFocused) return;
    let cancelled = false;
    setLoading(true);
    refetch()
      .catch(() => {
        if (!cancelled) {
          setBalances([]);
          setMovements([]);
          setMovementsHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, refetch]);

  const itemMap = useMemo(() => {
    const m = {};
    for (const b of balances) m[b.item.id] = b;
    return m;
  }, [balances]);

  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const getClientName = (id) => clients.find((c) => c.id === id)?.name || "—";

  const selectedSupplierLabel = useMemo(() => {
    if (!form.supplierId) return "-- اختر المورد --";
    const s = suppliers.find((x) => x.id === form.supplierId);
    if (!s) return "-- اختر المورد --";
    return s.category ? `${s.name} (${s.category})` : s.name;
  }, [form.supplierId, suppliers]);

  const selectedItemLabel = useMemo(() => {
    if (!form.itemId) return "-- اختر الصنف --";
    const b = balances.find((x) => x.item.id === form.itemId);
    if (!b) return "-- اختر الصنف --";
    const unit = getStockUnitLabel(b.item.unit);
    return `${b.item.name} — رصيد ${fmt(b.quantity)} ${unit}`;
  }, [form.itemId, balances]);

  const openPurchase = async () => {
    setFormErrors({});
    setShowSupplierPicker(false);
    setShowItemPicker(false);
    let supList = suppliers;
    try {
      supList = await getSuppliers();
      setSuppliers(supList || []);
    } catch (_) {
      supList = [];
    }
    setForm({
      stockModal: "purchase",
      itemId: balances[0]?.item?.id,
      supplierId: supList?.[0]?.id ?? null,
      date: new Date().toISOString().split("T")[0],
    });
    setModal("stockPurchase");
  };

  const openAddItem = () => {
    setFormErrors({});
    setForm({
      stockModal: "item",
      itemName: "",
      itemUnit: STOCK_UNITS[0].id,
      itemExpenseCat: CLIENT_EXPENSE_CATS[0],
    });
    setModal("stockItem");
  };

  const savePurchase = async () => {
    const err = {};
    const qty = parsePositiveAmount(form.quantity);
    const price = parsePositiveAmount(form.unitPrice);
    if (qty == null) err.quantity = FORM_MSG.amount;
    if (price == null) err.unitPrice = FORM_MSG.amount;
    if (!form.itemId) err.itemId = "اختر الصنف";
    if (!form.supplierId) {
      err.supplierId =
        suppliers.length > 0 ? FORM_MSG.supplier : "أضف مورداً من شاشة «الموردين» ثم اختره من القائمة";
    }
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    try {
      await recordStockPurchase({
        itemId: form.itemId,
        supplierId: form.supplierId,
        quantity: qty,
        unitPrice: price,
        date,
        note: form.note || "",
        fiscalYearId: activeFiscalYearId,
      });
      await refetch();
      setModal(null);
      setForm({});
    } catch (e) {
      setFormErrors({ submit: "تعذر حفظ الشراء" });
    }
  };

  const saveItem = async () => {
    const name = trimmed(form.itemName);
    if (!name) {
      setFormErrors({ itemName: "أدخل اسم الصنف" });
      return;
    }
    try {
      await upsertStockItem({
        name,
        unit: form.itemUnit || "count",
        expenseCat: form.itemExpenseCat || "أخرى",
      });
      await refetch();
      setModal(null);
      setForm({});
    } catch (_) {
      setFormErrors({ submit: "تعذر الحفظ" });
    }
  };

  const handleDeleteMovement = async (movId) => {
    try {
      await deleteStockMovement(movId);
      await refetch();
    } catch (_) {}
  };

  const totalInventoryValue = balances.reduce((s, b) => s + (b.totalValue || 0), 0);

  if (loading) {
    return (
      <ScreenLayout>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </ScreenLayout>
    );
  }

  return (
    <>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollWarehouse, scrollEventThrottle: 400 }}>
        <View style={styles.dashboard}>
          <Text style={styles.cardTitle}>📦 المخزن — {activeFiscalYearLabel}</Text>

          <View style={[styles.statCard, { marginBottom: 12, borderColor: "rgba(99,102,241,0.35)" }]}>
            <Text style={styles.statSubLabel}>قيمة المخزون الحالية (تقريبي)</Text>
            <Text style={[styles.statValue, { color: "#818cf8" }]}>
              {fmt(totalInventoryValue)} {CURRENCY}
            </Text>
          </View>

          <TouchableOpacity style={[styles.btn, styles.btnIncome, { marginBottom: 12 }]} onPress={openPurchase}>
            <Text style={styles.btnText}>+ شراء من مورد للمخزن</Text>
          </TouchableOpacity>
          <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>
            صرف المواد على العميل يتم من صفحة العميل → «مصروف على العميل» → «من المخزن».
          </Text>
          <TouchableOpacity style={[styles.btn, { marginBottom: 16, backgroundColor: "rgba(148,163,184,0.2)" }]} onPress={openAddItem}>
            <Text style={styles.btnText}>+ صنف جديد</Text>
          </TouchableOpacity>

          <Text style={[styles.cardTitle, { fontSize: 16, marginBottom: 8 }]}>الأصناف والرصيد</Text>
          {balances.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>لا توجد أصناف — أضف صنفاً أو سجّل شراء</Text>
            </View>
          ) : (
            balances.map((b) => (
              <View
                key={b.item.id}
                style={[
                  styles.txItemStack,
                  { borderColor: "rgba(99,102,241,0.25)", marginBottom: 8 },
                ]}
              >
                <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 16 }}>{b.item.name}</Text>
                <Text style={{ color: "#94a3b8", marginTop: 4 }}>
                  الرصيد: {fmt(b.quantity, 2)} {getStockUnitLabel(b.item.unit)}
                </Text>
                <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  متوسط التكلفة: {fmt(b.avgCost, 2)} {CURRENCY}/{getStockUnitLabel(b.item.unit)} — القيمة:{" "}
                  {fmt(b.totalValue)} {CURRENCY}
                </Text>
              </View>
            ))
          )}

          <Text style={[styles.cardTitle, { fontSize: 16, marginTop: 16, marginBottom: 8 }]}>
            آخر الحركات (السنة المالية)
          </Text>
          {movements.length === 0 ? (
            <Text style={styles.emptyText}>لا حركات بعد</Text>
          ) : (
            movements.map((m) => {
              const item = itemMap[m.itemId]?.item;
              const isIn = m.direction === "in";
              return (
                <View
                  key={m.id}
                  style={[
                    styles.txItemStack,
                    {
                      borderColor: isIn ? "rgba(16,185,129,0.3)" : "rgba(251,146,60,0.3)",
                      marginBottom: 8,
                    },
                  ]}
                >
                  <View style={styles.txItemRow}>
                    <Text style={styles.txIcon}>{isIn ? "📥" : "📤"}</Text>
                    <Text style={{ color: "#e2e8f0", fontWeight: "600", flex: 1 }}>
                      {item?.name || "صنف"}
                    </Text>
                    <Text style={styles.txDate}>{m.date}</Text>
                  </View>
                  <Text style={{ color: "#94a3b8", marginTop: 4 }}>
                    {isIn ? "شراء" : "صرف"}: {fmt(m.quantity, 2)}{" "}
                    {getStockUnitLabel(item?.unit)} × {fmt(m.unitPrice, 2)} = {fmt(m.quantity * m.unitPrice)}{" "}
                    {CURRENCY}
                  </Text>
                  <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                    {isIn
                      ? `مورد: ${getSupplierName(m.supplierId)}`
                      : `عميل: ${getClientName(m.clientId)}`}
                  </Text>
                  <TouchableOpacity style={styles.txDeleteBtn} onPress={() => handleDeleteMovement(m.id)}>
                    <Text style={styles.txDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          {movements.length > 0 && movementsLoadingMore ? (
            <ActivityIndicator color="#818cf8" style={{ marginVertical: 16 }} />
          ) : null}
          {movements.length > 0 && !movementsHasMore && !movementsLoadingMore ? (
            <Text style={[styles.emptyText, { marginTop: 8, fontSize: 12 }]}>— نهاية الحركات —</Text>
          ) : null}
        </View>
      </ScreenLayout>

      <CustomModal
        visible={modal === "stockPurchase"}
        onClose={() => {
          setFormErrors({});
          setShowSupplierPicker(false);
          setShowItemPicker(false);
          setModal(null);
        }}
      >
        <Text style={styles.modalTitle}>📥 شراء للمخزن</Text>
        <View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>🏭 المورد</Text>
            {suppliers.length === 0 ? (
              <Text style={{ color: "#94a3b8", marginBottom: 8 }}>
                لا يوجد موردون مسجّلون. أضف مورداً من تبويب «الموردين» في القائمة أولاً.
              </Text>
            ) : (
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[
                    styles.pickerBtn,
                    formErrors.supplierId ? styles.inputError : null,
                  ]}
                  onPress={() => {
                    setShowItemPicker(false);
                    setShowSupplierPicker((p) => !p);
                  }}
                >
                  <Text
                    style={[styles.pickerBtnText, form.supplierId && { color: "#a78bfa" }]}
                    numberOfLines={1}
                  >
                    {selectedSupplierLabel}
                  </Text>
                  <Text style={styles.pickerBtnArrow}>▾</Text>
                </TouchableOpacity>
                {showSupplierPicker && (
                  <View style={styles.pickerDropdown}>
                    <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      <TouchableOpacity
                        style={[styles.pickerItem, !form.supplierId && styles.pickerItemActive]}
                        onPress={() => {
                          setFormErrors((e) => ({ ...e, supplierId: undefined }));
                          setForm((p) => ({ ...p, supplierId: null }));
                          setShowSupplierPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            !form.supplierId && styles.pickerItemTextActive,
                          ]}
                        >
                          -- اختر المورد --
                        </Text>
                      </TouchableOpacity>
                      {suppliers.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.pickerItem, form.supplierId === s.id && styles.pickerItemActive]}
                          onPress={() => {
                            setFormErrors((e) => ({ ...e, supplierId: undefined }));
                            setForm((p) => ({ ...p, supplierId: s.id }));
                            setShowSupplierPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              form.supplierId === s.id && styles.pickerItemTextActive,
                            ]}
                          >
                            {s.name}
                            {s.category ? ` (${s.category})` : ""}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            {formErrors.supplierId ? <Text style={styles.fieldErrorText}>{formErrors.supplierId}</Text> : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الصنف</Text>
            {balances.length === 0 ? (
              <Text style={{ color: "#94a3b8", marginBottom: 8 }}>
                لا توجد أصناف — أضف صنفاً من «صنف جديد» أولاً.
              </Text>
            ) : (
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[styles.pickerBtn, formErrors.itemId ? styles.inputError : null]}
                  onPress={() => {
                    setShowSupplierPicker(false);
                    setShowItemPicker((p) => !p);
                  }}
                >
                  <Text
                    style={[styles.pickerBtnText, form.itemId && { color: "#818cf8" }]}
                    numberOfLines={1}
                  >
                    {selectedItemLabel}
                  </Text>
                  <Text style={styles.pickerBtnArrow}>▾</Text>
                </TouchableOpacity>
                {showItemPicker && (
                  <View style={styles.pickerDropdown}>
                    <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      <TouchableOpacity
                        style={[styles.pickerItem, !form.itemId && styles.pickerItemActive]}
                        onPress={() => {
                          setFormErrors((e) => ({ ...e, itemId: undefined }));
                          setForm((p) => ({ ...p, itemId: null }));
                          setShowItemPicker(false);
                        }}
                      >
                        <Text
                          style={[styles.pickerItemText, !form.itemId && styles.pickerItemTextActive]}
                        >
                          -- اختر الصنف --
                        </Text>
                      </TouchableOpacity>
                      {balances.map((b) => (
                        <TouchableOpacity
                          key={b.item.id}
                          style={[styles.pickerItem, form.itemId === b.item.id && styles.pickerItemActive]}
                          onPress={() => {
                            setFormErrors((e) => ({ ...e, itemId: undefined }));
                            setForm((p) => ({ ...p, itemId: b.item.id }));
                            setShowItemPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              form.itemId === b.item.id && styles.pickerItemTextActive,
                            ]}
                          >
                            {b.item.name} — رصيد {fmt(b.quantity)} {getStockUnitLabel(b.item.unit)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            {formErrors.itemId ? <Text style={styles.fieldErrorText}>{formErrors.itemId}</Text> : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الكمية</Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              value={form.quantity?.toString() || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, quantity: t }))}
              keyboardType="numeric"
              error={formErrors.quantity}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>سعر الوحدة ({CURRENCY})</Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              value={form.unitPrice?.toString() || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, unitPrice: t }))}
              keyboardType="numeric"
              error={formErrors.unitPrice}
            />
          </View>
          <FormDateField
            styles={styles}
            value={form.date}
            onChangeValue={(v) => setForm((p) => ({ ...p, date: v }))}
            active={modal === "stockPurchase"}
            error={formErrors.date}
          />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة</Text>
            <FormTextInput
              styles={styles}
              value={form.note || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, note: t }))}
            />
          </View>
        </View>
        {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
        <TouchableOpacity style={[styles.btn, styles.btnIncome, styles.modalSaveBtn]} onPress={savePurchase}>
          <Text style={styles.btnText}>حفظ الشراء ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "stockItem"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
        }}
      >
        <Text style={styles.modalTitle}>صنف جديد</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>اسم الصنف</Text>
          <FormTextInput
            styles={styles}
            value={form.itemName || ""}
            onChangeText={(t) => setForm((p) => ({ ...p, itemName: t }))}
            error={formErrors.itemName}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>وحدة القياس</Text>
          <View style={styles.optionsGrid}>
            {STOCK_UNITS.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[styles.optionBtn, form.itemUnit === u.id && styles.optionBtnActive]}
                onPress={() => setForm((p) => ({ ...p, itemUnit: u.id }))}
              >
                <Text style={[styles.optionBtnText, form.itemUnit === u.id && styles.optionBtnTextActive]}>
                  {u.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>فئة مصروف العميل</Text>
          <View style={styles.optionsGrid}>
            {CLIENT_EXPENSE_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.optionBtn, form.itemExpenseCat === cat && styles.optionBtnActive]}
                onPress={() => setForm((p) => ({ ...p, itemExpenseCat: cat }))}
              >
                <Text
                  style={[styles.optionBtnText, form.itemExpenseCat === cat && styles.optionBtnTextActive]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnIncome, styles.modalSaveBtn]} onPress={saveItem}>
          <Text style={styles.btnText}>حفظ الصنف ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
