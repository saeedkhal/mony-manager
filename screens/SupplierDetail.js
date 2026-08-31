import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients, getWorkers, getClientWithTxs, upsertClient, getStockItemsWithBalance, recordStockPurchase } from "../utils/db";
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

export default function SupplierDetail({ selectedSupplier, setSelectedSupplier }) {
  const {
    loaded,
    activeFiscalYearId,
    activeFiscalYearLabel,
    setForm,
    setModal,
    deleteClientTx,
    modal,
    form,
    setShowClientPicker,
  } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txWorkers, setTxWorkers] = useState([]);
  const [txSuppliers, setTxSuppliers] = useState([]);
  const [stockBalances, setStockBalances] = useState([]);
  const [showStockItemPicker, setShowStockItemPicker] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [dateFiltersExpanded, setDateFiltersExpanded] = useState(false);

  useEffect(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setDateFiltersExpanded(false);
  }, [selectedSupplier]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getSuppliers(), getClients()])
      .then(([s, c]) => {
        if (!cancelled) {
          setSuppliers(s || []);
          setClients(c || []);
        }
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
        if (!cancelled) setClients([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded, selectedSupplier]);

  useEffect(() => {
    if (!loaded || (modal !== "addClientTx" && modal !== "addSupplierTx")) return;
    let cancelled = false;
    Promise.all([getWorkers(), getSuppliers(), getStockItemsWithBalance()])
      .then(([w, s, stock]) => {
        if (!cancelled) {
          setTxWorkers(w || []);
          setTxSuppliers(s || []);
          setStockBalances(stock || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxWorkers([]);
          setTxSuppliers([]);
          setStockBalances([]);
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
        const [sup, cl, stock] = await Promise.all([
          getSuppliers(),
          getClients(),
          getStockItemsWithBalance(),
        ]);
        setSuppliers(sup || []);
        setClients(cl || []);
        setStockBalances(stock || []);
        setModal(null);
        setShowClientPicker(false);
        setShowStockItemPicker(false);
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
      const [sup, cl] = await Promise.all([getSuppliers(), getClients()]);
      setSuppliers(sup || []);
      setClients(cl || []);
    } catch (_) {}
    setModal(null);
    setShowClientPicker(false);
    setForm({});
  };

  const supplierStats = useMemo(() => {
    return (suppliers || [])
      .map((s) => {
        const matchingTxs = (clients || []).flatMap((c) =>
          (c.txs || [])
            .filter((t) => t.type === "expense" && t.supplierId === s.id)
            .map((t) => ({ ...t, clientId: c.id, clientName: c.name }))
        );
        const total = matchingTxs.reduce((sum, t) => sum + t.amount, 0);
        const count = matchingTxs.length;
        return { ...s, total, count, txs: matchingTxs };
      })
      .sort((a, b) => b.total - a.total);
  }, [suppliers, clients]);

  const activeSupplier = useMemo(
    () => (selectedSupplier ? supplierStats.find((s) => s.id === selectedSupplier) : null),
    [supplierStats, selectedSupplier]
  );

  const expenseDateRange = useMemo(
    () => normalizeSupplierDetailDateRange(filterDateFrom, filterDateTo),
    [filterDateFrom, filterDateTo]
  );

  const filteredSupplierTxs = useMemo(() => {
    if (!activeSupplier) return [];
    let list = [...(activeSupplier.txs || [])];
    if (expenseDateRange.active) {
      const { dateFrom, dateTo } = expenseDateRange;
      list = list.filter((tx) => {
        const d = String(tx.date || "");
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    list.sort((a, b) => {
      const c = String(b.date || "").localeCompare(String(a.date || ""));
      if (c !== 0) return c;
      return Number(b.id) - Number(a.id);
    });
    return list;
  }, [activeSupplier, expenseDateRange]);

  const filteredSupplierStats = useMemo(() => {
    const total = filteredSupplierTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { total, count: filteredSupplierTxs.length };
  }, [filteredSupplierTxs]);

  const activeClientTxName = form.clientName;

  const selectedStockItemLabel = useMemo(() => {
    if (!form.itemId) return "-- اختر الصنف --";
    const b = stockBalances.find((x) => x.item.id === form.itemId);
    if (!b) return "-- اختر الصنف --";
    return `${b.item.name} — رصيد ${fmt(b.quantity)} ${getStockUnitLabel(b.item.unit)}`;
  }, [form.itemId, stockBalances]);

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
              setShowStockItemPicker(false);
              let stock = stockBalances;
              try {
                stock = await getStockItemsWithBalance();
                setStockBalances(stock || []);
              } catch (_) {}
              setForm({
                txType: "expense",
                cat: activeSupplier.category || "قماش",
                supplierId: activeSupplier.id,
                destination: "warehouse",
                itemId: (stock || [])[0]?.item?.id,
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
                    : "فلترة المعاملات بالتاريخ"}
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

          {activeSupplier.txs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد معاملات</Text>
            </View>
          ) : filteredSupplierTxs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد معاملات ضمن الفترة المحددة</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {filteredSupplierTxs.map((tx) => (
                <View key={tx.id} style={[styles.txItemStack, { borderColor: "rgba(251,146,60,0.3)" }]}>
                  <View style={styles.txItemRow}>
                    <Text style={styles.txIcon}>🔨</Text>
                    <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#818cf8" }]}>👤 {tx.clientName}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: "rgba(251,146,60,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#fb923c" }]}>{tx.cat}</Text>
                    </View>
                    <Text style={styles.txDate}>{tx.date}</Text>
                  </View>
                  <View style={styles.txTags}>
                    {tx.note ? <Text style={styles.txNote}>{tx.note}</Text> : null}
                  </View>
                  <View style={styles.txItemActionsRow}>
                    <Text style={[styles.txAmount, { color: "#fb923c", minWidth: undefined }]}>
                      -{fmt(tx.amount)} {CURRENCY}
                    </Text>
                    <View style={styles.txItemButtons}>
                      <TouchableOpacity
                        style={styles.txEditBtn}
                        onPress={() => {
                          setForm({
                            editTxId: tx.id,
                            clientId: tx.clientId,
                            clientName: tx.clientName || "",
                            txType: tx.type,
                            amount: tx.amount,
                            cat: tx.cat,
                            note: tx.note || "",
                            date: tx.date,
                            workerId: tx.workerId,
                            supplierId: tx.supplierId,
                          });
                          setFormErrors({});
                          setModal("addClientTx");
                        }}
                      >
                        <Text style={styles.txEditBtnText}>تعديل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.txDeleteBtn}
                        onPress={() => deleteClientTx(tx.clientId, tx.id)}
                      >
                        <Text style={styles.txDeleteBtnText}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
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
          setShowStockItemPicker(false);
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
                setShowStockItemPicker(false);
                setForm((p) => ({
                  ...p,
                  destination: "warehouse",
                  clientId: null,
                  amount: undefined,
                  itemId: stockBalances[0]?.item?.id,
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
                setShowStockItemPicker(false);
                setForm((p) => ({
                  ...p,
                  destination: "client",
                  itemId: undefined,
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
              {stockBalances.length === 0 ? (
                <Text style={{ color: "#94a3b8", marginBottom: 8 }}>
                  لا توجد أصناف — أضف صنفاً من تبويب «المخزن» أولاً.
                </Text>
              ) : (
                <View style={styles.pickerContainer}>
                  <TouchableOpacity
                    style={[styles.pickerBtn, formErrors.itemId ? styles.inputError : null]}
                    onPress={() => setShowStockItemPicker((p) => !p)}
                  >
                    <Text
                      style={[styles.pickerBtnText, form.itemId && { color: "#818cf8" }]}
                      numberOfLines={1}
                    >
                      {selectedStockItemLabel}
                    </Text>
                    <Text style={styles.pickerBtnArrow}>▾</Text>
                  </TouchableOpacity>
                  {showStockItemPicker && (
                    <View style={styles.pickerDropdown}>
                      <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                        {stockBalances.map((b) => (
                          <TouchableOpacity
                            key={b.item.id}
                            style={[
                              styles.pickerItem,
                              form.itemId === b.item.id && styles.pickerItemActive,
                            ]}
                            onPress={() => {
                              setFormErrors((e) => ({ ...e, itemId: undefined }));
                              setForm((p) => ({ ...p, itemId: b.item.id }));
                              setShowStockItemPicker(false);
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
              <Text style={styles.inputLabel}>
                الكمية
                {form.itemId
                  ? ` (${getStockUnitLabel(
                      stockBalances.find((b) => b.item.id === form.itemId)?.item?.unit
                    )})`
                  : ""}
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
