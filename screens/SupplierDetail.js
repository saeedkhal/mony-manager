import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getWorkers, getClientWithTxs, upsertClient, recordStockPurchase, getSupplierPurchaseHistory } from "../utils/db";
import { CURRENCY, CLIENT_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import { getStockUnitLabel } from "../utils/stockHelpers";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import ClientSearchSelect from "../components/ClientSearchSelect";
import StockItemSearchSelect from "../components/StockItemSearchSelect";

function normalizeSupplierDetailDateRange(fromRaw, toRaw) {
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

/** Filter row date pickers off while any tx/supplier modal is open (incl. parent «addSupplier»). */
const detailFilterDateFieldsActive = (modal) =>
  modal !== "addClientTx" && modal !== "addSupplierTx" && modal !== "addSupplier";

const PURCHASE_PAGE_SIZE = 5;

export default function SupplierDetail({ selectedSupplier, setSelectedSupplier }) {
  const {
    loaded,
    activeFiscalYearId,
    activeFiscalYearLabel,
    setForm,
    setModal,
    modal,
    form,
    setShowClientPicker,
  } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseRows, setPurchaseRows] = useState([]);
  const [purchasePage, setPurchasePage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txWorkers, setTxWorkers] = useState([]);
  const [txSuppliers, setTxSuppliers] = useState([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateFiltersExpanded, setDateFiltersExpanded] = useState(false);

  useEffect(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setDateFiltersExpanded(false);
    setPurchasePage(0);
  }, [selectedSupplier]);

  const reloadSupplierDetail = async () => {
    if (selectedSupplier == null) return;
    const [s, history] = await Promise.all([
      getSuppliers(),
      getSupplierPurchaseHistory(selectedSupplier, { fiscalYearId: activeFiscalYearId }),
    ]);
    setSuppliers(s || []);
    setPurchaseRows(history || []);
  };

  useEffect(() => {
    if (!loaded || selectedSupplier == null) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSuppliers(),
      getSupplierPurchaseHistory(selectedSupplier, { fiscalYearId: activeFiscalYearId }),
    ])
      .then(([s, history]) => {
        if (!cancelled) {
          setSuppliers(s || []);
          setPurchaseRows(history || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuppliers([]);
          setPurchaseRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedSupplier, activeFiscalYearId]);

  useEffect(() => {
    if (!loaded || (modal !== "addClientTx" && modal !== "addSupplierTx")) return;
    let cancelled = false;
    Promise.all([getWorkers(), getSuppliers()])
      .then(([w, s]) => {
        if (!cancelled) {
          setTxWorkers(w || []);
          setTxSuppliers(s || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxWorkers([]);
          setTxSuppliers([]);
        }
      });
    return () => { cancelled = true; };
  }, [loaded, modal]);

  const saveClientTx = async () => {
    const err = {};
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;

    if (modal === "addSupplierTx" && form.destination === "warehouse") {
      const qty = parsePositiveAmount(form.quantity);
      const price = parsePositiveAmount(form.unitPrice);
      if (qty == null) err.quantity = FORM_MSG.amount;
      if (price == null) err.unitPrice = FORM_MSG.amount;
      if (!form.itemId) err.itemId = FORM_MSG.chooseItem;
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
        await reloadSupplierDetail();
        setModal(null);
        setShowClientPicker(false);
        setForm({});
      } catch (_) {
        setFormErrors({ submit: "تعذر توريد المخزن" });
      }
      return;
    }

    const num = parsePositiveAmount(form.amount);
    if (num == null) err.amount = FORM_MSG.amount;
    if (modal === "addSupplierTx" && !form.clientId) err.clientId = FORM_MSG.client;
    if (form.txType === "expense" && form.cat === "مصنعية" && txWorkers.length > 0 && !form.workerId) {
      err.workerId = FORM_MSG.worker;
    }
    if (
      form.txType === "expense" &&
      (form.cat === "قماش" || form.cat === "خشب وكلف") &&
      txSuppliers.length > 0 &&
      !form.supplierId
    ) {
      err.supplierId = FORM_MSG.supplier;
    }
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setFormErrors({});
    const targetClientId = form.clientId;
    const c = await getClientWithTxs(targetClientId);
    if (!c) return;
    const tx = { type: form.txType, amount: num, cat: form.cat, note: form.note || "", date };
    if (form.workerId) tx.workerId = form.workerId;
    if (form.supplierId) tx.supplierId = form.supplierId;
    let updatedClient;
    if (form.editTxId) {
      tx.id = form.editTxId;
      updatedClient = {
        ...c,
        txs: (c.txs || []).map((t) => (t.id === form.editTxId ? tx : t)),
      };
    } else {
      tx.id = Date.now();
      updatedClient = { ...c, txs: [...(c.txs || []), tx] };
    }
    try {
      await upsertClient(updatedClient);
      await reloadSupplierDetail();
    } catch (_) {}
    setModal(null);
    setShowClientPicker(false);
    setForm({});
  };

  const activeSupplier = useMemo(
    () => (selectedSupplier ? (suppliers || []).find((s) => s.id === selectedSupplier) : null),
    [suppliers, selectedSupplier]
  );

  const expenseDateRange = useMemo(
    () => normalizeSupplierDetailDateRange(filterDateFrom, filterDateTo),
    [filterDateFrom, filterDateTo]
  );

  const filteredPurchases = useMemo(() => {
    let list = [...(purchaseRows || [])];
    if (expenseDateRange.active) {
      const { dateFrom, dateTo } = expenseDateRange;
      list = list.filter((row) => {
        const d = String(row.date || "");
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    return list;
  }, [purchaseRows, expenseDateRange]);

  const filteredSupplierStats = useMemo(() => {
    const total = filteredPurchases.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { total, count: filteredPurchases.length };
  }, [filteredPurchases]);

  const purchasePageCount = Math.max(1, Math.ceil(filteredPurchases.length / PURCHASE_PAGE_SIZE));

  useEffect(() => {
    setPurchasePage(0);
  }, [expenseDateRange.dateFrom, expenseDateRange.dateTo, expenseDateRange.active]);

  const pagedPurchases = useMemo(() => {
    const maxPage = Math.max(0, purchasePageCount - 1);
    const page = Math.min(purchasePage, maxPage);
    const start = page * PURCHASE_PAGE_SIZE;
    return filteredPurchases.slice(start, start + PURCHASE_PAGE_SIZE);
  }, [filteredPurchases, purchasePage, purchasePageCount]);

  const activeClientTxName = form.clientName;

  const selectedStockItemLabel = form.itemName
    ? `${form.itemName} — رصيد ${fmt(form.itemQty)} ${getStockUnitLabel(form.itemUnit)}`
    : "";

  if (!selectedSupplier) return null;
  if (loading) {
    return (
      <ScreenLayout>
        <View style={styles.supplierDetail}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </ScreenLayout>
    );
  }
  if (!activeSupplier) return null;

  return (
    <View style={{ flex: 1 }}>
      <ScreenLayout>
        <View style={styles.supplierDetail}>
          <View style={styles.clientDetailBackRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedSupplier(null)}>
              <Text style={styles.backBtnText}>←</Text>
              <Text style={styles.backBtnText}>رجوع</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.clientDetailHeaderStack}>
            <Text style={styles.clientDetailName} numberOfLines={2}>
              🏭 {activeSupplier.name}
            </Text>
            <Text style={styles.clientDetailMeta}>السنة المالية {activeFiscalYearLabel}</Text>
            {activeSupplier.phone ? (
              <Text style={styles.clientDetailMeta}>📞 {activeSupplier.phone}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.editBtn, styles.clientDetailHeaderBtn]}
              onPress={() => {
                setForm({
                  editId: activeSupplier.id,
                  name: activeSupplier.name,
                  phone: activeSupplier.phone,
                  category: activeSupplier.category,
                });
                setModal("addSupplier");
              }}
            >
              <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)" },
            ]}
          >
            <Text style={styles.supplierDetailStatsLabel}>
              إجمالي المشتريات من {activeSupplier.name}
              {expenseDateRange.active ? " (ضمن الفترة)" : ""}
            </Text>
            <Text style={styles.supplierDetailStatsValue}>
              {fmt(filteredSupplierStats.total)} {CURRENCY}
            </Text>
            <Text style={styles.supplierDetailStatsCount}>
              {filteredSupplierStats.count} معاملة
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnSupplier, { width: "100%", marginBottom: 20 }]}
            onPress={async () => {
              setFormErrors({});
              setForm({
                txType: "expense",
                cat: activeSupplier.category || "قماش",
                supplierId: activeSupplier.id,
                destination: "warehouse",
                date: new Date().toISOString().split("T")[0],
              });
              setModal("addSupplierTx");
            }}
          >
            <Text style={styles.btnText}>+ إضافة مشتريات من {activeSupplier.name}</Text>
          </TouchableOpacity>

          <View style={{ marginBottom: 14 }}>
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
                borderColor: "rgba(139,92,246,0.28)",
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
                    : "فلترة المشتريات بالتاريخ"}
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
                  <Text style={{ color: "#a78bfa", fontSize: 12 }}>مسح</Text>
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
                      active={detailFilterDateFieldsActive(modal)}
                      compact
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <FormDateField
                      styles={styles}
                      label="إلى"
                      value={filterDateTo}
                      onChangeValue={setFilterDateTo}
                      active={detailFilterDateFieldsActive(modal)}
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
                    <Text style={{ color: "#a78bfa", fontSize: 12 }}>مسح الحقول</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          {purchaseRows.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد مشتريات</Text>
            </View>
          ) : filteredPurchases.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد مشتريات ضمن الفترة المحددة</Text>
            </View>
          ) : (
            <View style={styles.stockTableCard}>
              <View style={styles.stockTableHeader}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                    المادة
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
              </View>
              {pagedPurchases.map((row, index) => {
                const isLast = index === pagedPurchases.length - 1;
                const unitLabel = row.unit ? getStockUnitLabel(row.unit) : "";
                const qtyLine =
                  row.source === "stock" && row.quantity > 0
                    ? `${fmt(row.quantity)}${unitLabel ? ` ${unitLabel}` : ""}`
                    : row.detail || "";
                return (
                  <View
                    key={row.id}
                    style={[
                      styles.stockTableRow,
                      index % 2 === 1 && styles.stockTableRowAlt,
                      isLast && purchasePageCount <= 1 && styles.stockTableRowLast,
                    ]}
                  >
                    <View style={[styles.stockTableCol, styles.stockTableColName]}>
                      <Text style={styles.stockTableCellName} numberOfLines={2}>
                        {row.material}
                      </Text>
                      {qtyLine ? (
                        <Text style={styles.stockTableCellSub} numberOfLines={1}>
                          {qtyLine}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                      <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                        {row.date || "—"}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                      <Text
                        style={[styles.stockTableCell, styles.stockTableCellCenter, { color: "#a78bfa" }]}
                        numberOfLines={1}
                      >
                        {fmt(row.amount)} {CURRENCY}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.stockTableFooter}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableFooterText}>الإجمالي ({filteredPurchases.length})</Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColPhone]} />
                <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                  <Text
                    style={[
                      styles.stockTableFooterText,
                      styles.stockTableCellCenter,
                      { color: "#a78bfa", width: "100%" },
                    ]}
                    numberOfLines={1}
                  >
                    {fmt(filteredSupplierStats.total)} {CURRENCY}
                  </Text>
                </View>
              </View>
              {purchasePageCount > 1 ? (
                <View style={styles.stockTablePager}>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      purchasePage === 0 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => setPurchasePage((p) => Math.max(0, p - 1))}
                    disabled={purchasePage === 0}
                  >
                    <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                  </TouchableOpacity>
                  <Text style={styles.stockTablePagerInfo}>
                    صفحة {Math.min(purchasePage, purchasePageCount - 1) + 1} من {purchasePageCount}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      purchasePage >= purchasePageCount - 1 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => setPurchasePage((p) => Math.min(purchasePageCount - 1, p + 1))}
                    disabled={purchasePage >= purchasePageCount - 1}
                  >
                    <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScreenLayout>

      <CustomModal
        visible={modal === "addClientTx"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
        }}
      >
        <Text style={styles.modalTitle}>
          {form.editTxId
            ? "✏️ تعديل معاملة"
            : form.txType === "income"
              ? "💵 دفعة مستلمة"
              : "🔨 مصروف على العميل"}
        </Text>
        <Text style={styles.modalSubtitle}>
          العميل: {activeClientTxName} — {activeFiscalYearLabel}
        </Text>
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
            {(form.txType === "income"
              ? ["مقدم", "دفعة", "رصيد نهائي", "أخرى"]
              : CLIENT_EXPENSE_CATS
            ).map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && styles.optionBtnActive,
                  form.txType === "income" && form.cat === cat && { backgroundColor: "#6366f1" },
                  form.txType === "expense" && form.cat === cat && { backgroundColor: "#f43f5e" },
                ]}
                onPress={() => {
                  setFormErrors((e) => ({ ...e, workerId: undefined, supplierId: undefined }));
                  setForm((p) => ({ ...p, cat, workerId: undefined, supplierId: undefined }));
                }}
              >
                <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {form.txType === "expense" && form.cat === "مصنعية" && txWorkers.length > 0 && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👷 الصنايعي</Text>
            <View style={styles.optionsGrid}>
              {txWorkers.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    styles.optionBtn,
                    form.workerId === w.id && {
                      backgroundColor: "rgba(245,158,11,0.3)",
                      borderColor: "#f59e0b",
                    },
                  ]}
                  onPress={() => {
                    setFormErrors((e) => ({ ...e, workerId: undefined }));
                    setForm((p) => ({ ...p, workerId: w.id }));
                  }}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      form.workerId === w.id && { color: "#f59e0b", fontWeight: "700" },
                    ]}
                  >
                    {w.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {formErrors.workerId ? <Text style={styles.fieldErrorText}>{formErrors.workerId}</Text> : null}
          </View>
        )}
        {form.txType === "expense" &&
          (form.cat === "قماش" || form.cat === "خشب وكلف") &&
          txSuppliers.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>🏭 المورد</Text>
              <View style={styles.optionsGrid}>
                {txSuppliers.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.optionBtn,
                      form.supplierId === s.id && {
                        backgroundColor: "rgba(139,92,246,0.3)",
                        borderColor: "#a78bfa",
                      },
                    ]}
                    onPress={() => {
                      setFormErrors((e) => ({ ...e, supplierId: undefined }));
                      setForm((p) => ({ ...p, supplierId: s.id }));
                    }}
                  >
                    <Text
                      style={[
                        styles.optionBtnText,
                        form.supplierId === s.id && { color: "#a78bfa", fontWeight: "700" },
                      ]}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            {formErrors.supplierId ? <Text style={styles.fieldErrorText}>{formErrors.supplierId}</Text> : null}
            </View>
          )}
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
          active={modal === "addClientTx"}
          error={formErrors.date}
        />
        <TouchableOpacity
          style={[
            styles.btn,
            form.txType === "income" ? styles.btnIncome : styles.btnExpense,
            styles.modalSaveBtn,
          ]}
          onPress={saveClientTx}
        >
          <Text style={styles.btnText}>{form.editTxId ? "حفظ التعديلات ✓" : "حفظ ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "addSupplierTx"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
          setShowClientPicker(false);
        }}
      >
        <Text style={styles.modalTitle}>
          🔨 إضافة مشتريات من {txSuppliers.find((s) => s.id === form.supplierId)?.name}
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>الوجهة</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
            <TouchableOpacity
              style={[
                styles.btn,
                {
                  flex: 1,
                  backgroundColor:
                    form.destination === "warehouse" ? "#6366f1" : "rgba(148,163,184,0.2)",
                },
              ]}
              onPress={() => {
                setFormErrors({});
                setShowClientPicker(false);
                setForm((p) => ({
                  ...p,
                  destination: "warehouse",
                  clientId: null,
                  clientName: undefined,
                  amount: undefined,
                  itemId: undefined,
                  itemName: undefined,
                  itemUnit: undefined,
                  itemQty: undefined,
                }));
              }}
            >
              <Text style={styles.btnText}>📦 توريد للمخزن</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                {
                  flex: 1,
                  backgroundColor:
                    form.destination !== "warehouse" ? "#8b5cf6" : "rgba(148,163,184,0.2)",
                },
              ]}
              onPress={() => {
                setFormErrors({});
                setForm((p) => ({
                  ...p,
                  destination: "client",
                  itemId: undefined,
                  itemName: undefined,
                  itemUnit: undefined,
                  itemQty: undefined,
                  quantity: undefined,
                  unitPrice: undefined,
                }));
              }}
            >
              <Text style={styles.btnText}>👤 على العميل</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            {form.destination === "warehouse"
              ? "يُضاف للصنف في المخزن بدون ربط بعميل."
              : "يُسجَّل مصروفاً على العميل بدون تغيير رصيد المخزن."}
          </Text>
        </View>
        {form.destination === "warehouse" ? (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>الصنف</Text>
              <StockItemSearchSelect
                styles={styles}
                value={form.itemId}
                selectedLabel={selectedStockItemLabel}
                error={formErrors.itemId}
                active={modal === "addSupplierTx" && form.destination === "warehouse"}
                onChange={(item) => {
                  setFormErrors((e) => ({ ...e, itemId: undefined }));
                  setForm((p) => ({
                    ...p,
                    itemId: item?.id ?? null,
                    itemName: item?.name ?? "",
                    itemUnit: item?.unit,
                    itemQty: item?.quantity,
                  }));
                }}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                الكمية
                {form.itemUnit ? ` (${getStockUnitLabel(form.itemUnit)})` : ""}
              </Text>
              <FormTextInput
                styles={styles}
                placeholder="0"
                placeholderTextColor="#64748b"
                value={form.quantity?.toString() || ""}
                onChangeText={(text) => {
                  setFormErrors((e) => ({ ...e, quantity: undefined }));
                  setForm((p) => ({ ...p, quantity: text }));
                }}
                keyboardType="numeric"
                error={formErrors.quantity}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>سعر الوحدة ({CURRENCY})</Text>
              <FormTextInput
                styles={styles}
                placeholder="0"
                placeholderTextColor="#64748b"
                value={form.unitPrice?.toString() || ""}
                onChangeText={(text) => {
                  setFormErrors((e) => ({ ...e, unitPrice: undefined }));
                  setForm((p) => ({ ...p, unitPrice: text }));
                }}
                keyboardType="numeric"
                error={formErrors.unitPrice}
              />
            </View>
          </>
        ) : (
          <>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>👤 العميل</Text>
          <ClientSearchSelect
            styles={styles}
            value={form.clientId}
            selectedLabel={form.clientName || ""}
            error={formErrors.clientId}
            active={modal === "addSupplierTx"}
            onChange={(c) => {
              setFormErrors((e) => ({ ...e, clientId: undefined }));
              setForm((p) => ({
                ...p,
                clientId: c?.id ?? null,
                clientName: c?.name ?? "",
              }));
            }}
          />
        </View>
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
            {["قماش", "خشب وكلف", "أخرى"].map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && [styles.optionBtnActive, { backgroundColor: "#8b5cf6" }],
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
          </>
        )}
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
          active={modal === "addSupplierTx"}
          error={formErrors.date}
        />
        {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
        <TouchableOpacity style={[styles.btn, styles.btnSupplier, styles.modalSaveBtn]} onPress={saveClientTx}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </View>
  );
}
