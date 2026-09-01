import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getClientWithTxs,
  getWorkers,
  getSuppliers,
  getStockItemsWithBalance,
  getStockMovements,
  recordStockIssue,
  updateStockMovement,
  upsertClient,
  deleteClient as dbDeleteClient,
} from "../utils/db";
import { CURRENCY, STATUS_LABELS, CLIENT_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import { getStockUnitLabel } from "../utils/stockHelpers";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";

export default function ClientDetail({ selectedClient, setSelectedClient, onClientDeleted, onEditClient, reloadToken }) {
  const { activeFiscalYearId, activeFiscalYearLabel, deleteClientTx, setForm, setModal, modal, form } =
    useApp();

  const [formErrors, setFormErrors] = useState({});
  const [stockBalances, setStockBalances] = useState([]);
  const [stockPreviewAmount, setStockPreviewAmount] = useState(null);
  const [showStockItemPicker, setShowStockItemPicker] = useState(false);

  const openClientTx = async (cid, txType, editTx = null) => {
    setFormErrors({});
    setStockPreviewAmount(null);
    setShowStockItemPicker(false);
    const today = new Date().toISOString().split("T")[0];
    if (editTx?.stockMovementId != null) {
      let stock = stockBalances;
      try {
        stock = await getStockItemsWithBalance();
        setStockBalances(stock || []);
      } catch (_) {}
      let movNote = editTx.note || "";
      try {
        const movs = await getStockMovements(editTx.stockItemId);
        const mov = (movs || []).find((m) => Number(m.id) === Number(editTx.stockMovementId));
        if (mov) movNote = mov.note || "";
      } catch (_) {}
      setForm({
        clientId: cid,
        editTxId: editTx.id,
        editStockMovementId: editTx.stockMovementId,
        txType: "expense",
        expenseMode: "warehouse",
        stockItemId: editTx.stockItemId,
        stockQuantity: String(editTx.stockQuantity ?? ""),
        editMovementQty: editTx.stockQuantity,
        note: movNote,
        date: editTx.date,
      });
      setModal("addClientTx");
      return;
    }
    if (editTx) {
      setForm({
        clientId: cid,
        editTxId: editTx.id,
        txType: editTx.type,
        amount: editTx.amount,
        cat: editTx.cat,
        note: editTx.note || "",
        date: editTx.date,
        workerId: editTx.workerId,
        supplierId: editTx.supplierId,
        expenseMode: "manual",
      });
    } else if (txType === "expense") {
      let stock = stockBalances;
      try {
        stock = await getStockItemsWithBalance();
        setStockBalances(stock || []);
      } catch (_) {}
      const inStock = (stock || []).filter((b) => b.quantity > 0);
      setForm({
        clientId: cid,
        txType,
        expenseMode: "manual",
        cat: CLIENT_EXPENSE_CATS[0],
        stockItemId: inStock[0]?.item?.id,
        stockQuantity: "",
        date: today,
      });
    } else {
      setForm({
        clientId: cid,
        txType,
        cat: "مقدم",
        date: today,
      });
    }
    setModal("addClientTx");
  };

  const deleteClient = async (cid) => {
    try {
      await dbDeleteClient(cid);
    } catch (_) {}
  };

  const [client, setClient] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedClient) {
      setClient(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getClientWithTxs(selectedClient),
      getWorkers(),
      getSuppliers(),
      getStockItemsWithBalance(),
    ])
      .then(([c, w, s, stock]) => {
        if (!cancelled) {
          setClient(c || null);
          setWorkers(w || []);
          setSuppliers(s || []);
          setStockBalances(stock || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClient(null);
          setWorkers([]);
          setSuppliers([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedClient, reloadToken]);

  const refetchClientScreen = async () => {
    if (!selectedClient) return;
    try {
      const [c, w, s, stock] = await Promise.all([
        getClientWithTxs(selectedClient),
        getWorkers(),
        getSuppliers(),
        getStockItemsWithBalance(),
      ]);
      setClient(c || null);
      setWorkers(w || []);
      setSuppliers(s || []);
      setStockBalances(stock || []);
    } catch (_) {}
  };

  const handleDeleteClientTx = async (cid, tid) => {
    try {
      await deleteClientTx(cid, tid);
      await refetchClientScreen();
    } catch (_) {}
  };

  const toggleStatus = async (cid) => {
    const c = await getClientWithTxs(cid);
    if (!c) return;
    const updated = { ...c, status: c.status === "active" ? "done" : "active" };
    try {
      await upsertClient(updated);
      await refetchClientScreen();
    } catch (_) {}
  };

  const totals = useMemo(() => {
    if (!client) return { income: 0, expense: 0, profit: 0, orderAmount: 0, remaining: null };
    const txs = client.txs || [];
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const orderAmount = Number(client.orderAmount) > 0 ? Number(client.orderAmount) : 0;
    const remaining = orderAmount > 0 ? orderAmount - income : null;
    return { income, expense, profit: income - expense, orderAmount, remaining };
  }, [client]);

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || "غير محدد";
  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "غير محدد";
  const getStockItemName = (id) => stockBalances.find((b) => b.item.id === id)?.item?.name || "";

  const stockInStock = useMemo(
    () => stockBalances.filter((b) => b.quantity > 0),
    [stockBalances]
  );

  const selectedStockItemLabel = useMemo(() => {
    if (!form.stockItemId) return "-- اختر الصنف --";
    const b = stockBalances.find((x) => Number(x.item.id) === Number(form.stockItemId));
    if (!b) return "-- اختر الصنف --";
    return `${b.item.name} — متبقي ${fmt(b.quantity)} ${getStockUnitLabel(b.item.unit)}`;
  }, [form.stockItemId, stockBalances]);

  const isWarehouseExpense =
    form.txType === "expense" &&
    (form.expenseMode === "warehouse" || form.editStockMovementId != null);

  useEffect(() => {
    if (modal !== "addClientTx" || !isWarehouseExpense || !form.stockItemId || !form.stockQuantity) {
      setStockPreviewAmount(null);
      return;
    }
    const qty = parsePositiveAmount(form.stockQuantity);
    if (qty == null) {
      setStockPreviewAmount(null);
      return;
    }
    const b = stockBalances.find((x) => Number(x.item.id) === Number(form.stockItemId));
    if (!b) {
      setStockPreviewAmount(null);
      return;
    }
    const extraQty = form.editStockMovementId != null ? Number(form.editMovementQty) || 0 : 0;
    if (qty > b.quantity + extraQty) {
      setStockPreviewAmount(null);
      return;
    }
    setStockPreviewAmount(qty * (b.avgCost || 0));
  }, [
    modal,
    isWarehouseExpense,
    form.stockItemId,
    form.stockQuantity,
    form.editStockMovementId,
    form.editMovementQty,
    stockBalances,
  ]);

  const saveClientTx = async () => {
    const err = {};
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;

    if (isWarehouseExpense) {
      const qty = parsePositiveAmount(form.stockQuantity);
      if (qty == null) err.stockQuantity = FORM_MSG.amount;
      if (!form.stockItemId) err.stockItemId = FORM_MSG.chooseItem;
      const b = stockBalances.find((x) => Number(x.item.id) === Number(form.stockItemId));
      const extraQty = form.editStockMovementId != null ? Number(form.editMovementQty) || 0 : 0;
      const overQty = b && qty != null && qty > b.quantity + extraQty;
      if (overQty) err.stockQuantity = FORM_MSG.insufficientStock;
      if (Object.keys(err).length) {
        setFormErrors(err);
        return;
      }
      setFormErrors({});
      try {
        if (form.editStockMovementId) {
          await updateStockMovement({
            movementId: form.editStockMovementId,
            quantity: qty,
            clientId: form.clientId,
            date,
            note: form.note || "",
          });
        } else {
          await recordStockIssue({
            itemId: form.stockItemId,
            clientId: form.clientId,
            quantity: qty,
            date,
            note: form.note || "",
            fiscalYearId: activeFiscalYearId,
          });
        }
        await refetchClientScreen();
        setModal(null);
        setForm({});
        setStockPreviewAmount(null);
      } catch (e) {
        if (e?.message === "INSUFFICIENT_STOCK") {
          err.stockQuantity = FORM_MSG.insufficientStock;
        } else {
          err.submit = form.editStockMovementId ? "تعذر تعديل المصروف" : "تعذر الصرف من المخزن";
        }
        setFormErrors(err);
      }
      return;
    }

    const num = parsePositiveAmount(form.amount);
    if (num == null) err.amount = FORM_MSG.amount;
    if (form.txType === "expense" && form.cat === "مصنعية" && workers.length > 0 && !form.workerId) {
      err.workerId = FORM_MSG.worker;
    }
    if (
      form.txType === "expense" &&
      (form.cat === "قماش" || form.cat === "خشب وكلف") &&
      suppliers.length > 0 &&
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
    if (form.editTxId != null && form.editTxId !== "") {
      const editId = form.editTxId;
      updatedClient = {
        ...c,
        txs: (c.txs || []).map((t) => {
          if (String(t.id) !== String(editId)) return t;
          return { ...t, ...tx, id: t.id };
        }),
      };
    } else {
      tx.id = Date.now();
      updatedClient = { ...c, txs: [...(c.txs || []), tx] };
    }
    try {
      await upsertClient(updatedClient);
      await refetchClientScreen();
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const txModalClientName = client?.id === form.clientId ? client?.name : undefined;

  if (!selectedClient) return null;
  if (loading) {
    return (
      <ScreenLayout>
        <View style={styles.clientDetail}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </ScreenLayout>
    );
  }
  if (!client) return null;

  const s = STATUS_LABELS[client.status];
  const t = totals;

  return (
    <View style={{ flex: 1 }}>
    <ScreenLayout>
      <View style={styles.clientDetail}>
      <View style={styles.clientDetailBackRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedClient(null)}>
          <Text style={styles.backBtnText}>←</Text>
          <Text style={styles.backBtnText}>رجوع</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.clientDetailHeaderStack}>
        <Text style={styles.clientDetailName} numberOfLines={2}>
          {client.name}
        </Text>
        <Text style={styles.clientDetailMeta}>
          {client.project} — السنة المالية {activeFiscalYearLabel}
        </Text>
        {client.phone ? (
          <Text style={styles.clientDetailMeta}>📞 {client.phone}</Text>
        ) : null}
        <View style={styles.clientDetailHeaderBtnRow}>
          <TouchableOpacity
            style={[
              styles.statusBtn,
              styles.clientDetailHeaderBtn,
              { backgroundColor: s.bg, borderColor: (s.color || "#94a3b8") + "40" },
            ]}
            onPress={() => toggleStatus(client.id)}
          >
            <Text style={[styles.statusBtnText, { color: s.color }]}>{s.label}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.txEditBtn, styles.clientDetailHeaderBtn]}
            onPress={() => onEditClient?.(client)}
          >
            <Text style={styles.txEditBtnText}>تعديل البيانات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteBtn, styles.clientDetailHeaderBtn]}
            onPress={async () => {
              await deleteClient(client.id);
              onClientDeleted?.();
            }}
          >
            <Text style={styles.deleteBtnText}>حذف العميل</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.clientDetailStats}>
        {[
          ["📦 الطلبية", "#e2e8f0", "rgba(148,163,184,0.12)", t.orderAmount > 0 ? t.orderAmount : null],
          ["💵 المدفوع", "#818cf8", "rgba(129,140,248,0.1)", t.income],
          [
            "⏳ المتبقي",
            t.remaining == null ? "#94a3b8" : t.remaining > 0 ? "#fb923c" : t.remaining < 0 ? "#818cf8" : "#10b981",
            t.remaining == null
              ? "rgba(148,163,184,0.1)"
              : t.remaining > 0
                ? "rgba(251,146,60,0.1)"
                : t.remaining < 0
                  ? "rgba(129,140,248,0.1)"
                  : "rgba(16,185,129,0.1)",
            t.remaining,
          ],
          ["🔨 المصروفات", "#fb923c", "rgba(251,146,60,0.1)", t.expense],
          [
            "💰 الربح",
            t.profit >= 0 ? "#10b981" : "#f43f5e",
            t.profit >= 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)",
            t.profit,
          ],
        ].map(([l, col, bg, v]) => (
          <View key={l} style={[styles.clientDetailStatCard, { backgroundColor: bg, borderColor: col + "30" }]}>
            <Text style={styles.clientDetailStatLabel} numberOfLines={1}>
              {l}
            </Text>
            <Text style={[styles.clientDetailStatValue, { color: col }]} numberOfLines={1}>
              {v == null ? "—" : `${fmt(v)} ${CURRENCY}`}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.clientDetailActions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnIncome, { flex: 1 }]}
          onPress={() => openClientTx(client.id, "income")}
        >
          <Text style={styles.btnText}>+ دفعة مستلمة 📈</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnExpense, { flex: 1 }]}
          onPress={() => openClientTx(client.id, "expense")}
        >
          <Text style={styles.btnText}>+ مصروف على العميل 🔨</Text>
        </TouchableOpacity>
      </View>

      <View>
        {(client.txs || []).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>لا توجد معاملات</Text>
          </View>
        ) : (
          <View style={styles.txList}>
            {[...(client.txs || [])].reverse().map((tx) => (
              <View
                key={tx.id}
                style={[
                  styles.txItemStack,
                  { borderColor: tx.type === "income" ? "rgba(99,102,241,0.3)" : "rgba(251,146,60,0.3)" },
                ]}
              >
                <View style={styles.txItemRow}>
                  <Text style={styles.txIcon}>{tx.type === "income" ? "💵" : "🔨"}</Text>
                  <View
                    style={[
                      styles.tag,
                      {
                        backgroundColor: tx.type === "income" ? "rgba(99,102,241,0.2)" : "rgba(251,146,60,0.2)",
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: tx.type === "income" ? "#818cf8" : "#fb923c" }]}>
                      {tx.cat}
                    </Text>
                  </View>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
                <View style={styles.txTags}>
                  {tx.workerId && (
                    <View style={[styles.tag, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#f59e0b" }]}>👷 {getWorkerName(tx.workerId)}</Text>
                    </View>
                  )}
                  {tx.supplierId && (
                    <View style={[styles.tag, { backgroundColor: "rgba(139,92,246,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#a78bfa" }]}>🏭 {getSupplierName(tx.supplierId)}</Text>
                    </View>
                  )}
                  {tx.stockItemId != null && tx.stockQuantity != null && (
                    <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                      <Text style={[styles.tagText, { color: "#818cf8" }]}>
                        📦 {getStockItemName(tx.stockItemId)} — {tx.stockQuantity}
                      </Text>
                    </View>
                  )}
                  {tx.note ? <Text style={styles.txNote}>{tx.note}</Text> : null}
                </View>
                <View style={styles.txItemActionsRow}>
                  <Text
                    style={[
                      styles.txAmount,
                      { color: tx.type === "income" ? "#818cf8" : "#fb923c", minWidth: undefined },
                    ]}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {fmt(tx.amount)} {CURRENCY}
                  </Text>
                  <View style={styles.txItemButtons}>
                    <TouchableOpacity
                      style={styles.txEditBtn}
                      onPress={() => openClientTx(client.id, tx.type, tx)}
                    >
                      <Text style={styles.txEditBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.txDeleteBtn}
                      onPress={() => handleDeleteClientTx(client.id, tx.id)}
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
      </View>
    </ScreenLayout>
    <CustomModal
      visible={modal === "addClientTx"}
      onClose={() => {
        setFormErrors({});
        setModal(null);
        setStockPreviewAmount(null);
        setShowStockItemPicker(false);
      }}
    >
      <Text style={styles.modalTitle}>
        {form.editTxId
          ? form.editStockMovementId
            ? "✏️ تعديل مصروف من المخزن"
            : "✏️ تعديل معاملة"
          : form.txType === "income"
            ? "💵 دفعة مستلمة"
            : "🔨 مصروف على العميل"}
      </Text>
      <Text style={styles.modalSubtitle}>
        العميل: {txModalClientName} — {activeFiscalYearLabel}
      </Text>

      {form.txType === "expense" && !form.editTxId && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>طريقة تسجيل المصروف</Text>
          <View style={[styles.clientDetailActions, { marginBottom: 4 }]}>
            <TouchableOpacity
              style={[
                styles.btn,
                { flex: 1, backgroundColor: form.expenseMode !== "warehouse" ? "#f43f5e" : "rgba(148,163,184,0.2)" },
              ]}
              onPress={() => {
                setFormErrors({});
                setStockPreviewAmount(null);
                setShowStockItemPicker(false);
                setForm((p) => ({
                  ...p,
                  expenseMode: "manual",
                  stockItemId: undefined,
                  stockQuantity: "",
                }));
              }}
            >
              <Text style={styles.btnText}>يدوي (مبلغ وبند)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                {
                  flex: 1,
                  backgroundColor:
                    form.expenseMode === "warehouse" ? "#6366f1" : "rgba(148,163,184,0.2)",
                  opacity: stockInStock.length === 0 ? 0.45 : 1,
                },
              ]}
              disabled={stockInStock.length === 0}
              onPress={() => {
                setFormErrors({});
                setShowStockItemPicker(false);
                setForm((p) => ({
                  ...p,
                  expenseMode: "warehouse",
                  amount: undefined,
                  stockItemId: stockInStock[0]?.item?.id,
                  stockQuantity: "",
                  workerId: undefined,
                  supplierId: undefined,
                }));
              }}
            >
              <Text style={styles.btnText}>من المخزن 📦</Text>
            </TouchableOpacity>
          </View>
          {stockInStock.length === 0 && (
            <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>
              لا يوجد رصيد في المخزن — سجّل شراء من تبويب «المخزن» أو استخدم المصروف اليدوي.
            </Text>
          )}
        </View>
      )}

      {isWarehouseExpense ? (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الصنف من المخزن</Text>
            {form.editStockMovementId ? (
              <Text style={[styles.pickerBtnText, { color: "#818cf8" }]} numberOfLines={2}>
                {selectedStockItemLabel}
              </Text>
            ) : stockInStock.length === 0 ? (
              <Text style={{ color: "#64748b", fontSize: 12 }}>
                لا يوجد رصيد في المخزن — سجّل شراء من تبويب «المخزن» أولاً.
              </Text>
            ) : (
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[styles.pickerBtn, formErrors.stockItemId ? styles.inputError : null]}
                  onPress={() => setShowStockItemPicker((p) => !p)}
                >
                  <Text
                    style={[styles.pickerBtnText, form.stockItemId && { color: "#818cf8" }]}
                    numberOfLines={1}
                  >
                    {selectedStockItemLabel}
                  </Text>
                  <Text style={styles.pickerBtnArrow}>▾</Text>
                </TouchableOpacity>
                {showStockItemPicker && (
                  <View style={styles.pickerDropdown}>
                    <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      <TouchableOpacity
                        style={[styles.pickerItem, !form.stockItemId && styles.pickerItemActive]}
                        onPress={() => {
                          setFormErrors((e) => ({ ...e, stockItemId: undefined }));
                          setForm((p) => ({ ...p, stockItemId: null, stockQuantity: "" }));
                          setShowStockItemPicker(false);
                          setStockPreviewAmount(null);
                        }}
                      >
                        <Text
                          style={[styles.pickerItemText, !form.stockItemId && styles.pickerItemTextActive]}
                        >
                          -- اختر الصنف --
                        </Text>
                      </TouchableOpacity>
                      {stockInStock.map((b) => (
                        <TouchableOpacity
                          key={b.item.id}
                          style={[
                            styles.pickerItem,
                            form.stockItemId === b.item.id && styles.pickerItemActive,
                          ]}
                          onPress={() => {
                            setFormErrors((e) => ({ ...e, stockItemId: undefined, stockQuantity: undefined }));
                            setForm((p) => ({ ...p, stockItemId: b.item.id, stockQuantity: "" }));
                            setShowStockItemPicker(false);
                            setStockPreviewAmount(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              form.stockItemId === b.item.id && styles.pickerItemTextActive,
                            ]}
                          >
                            {b.item.name} — متبقي {fmt(b.quantity)} {getStockUnitLabel(b.item.unit)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            {formErrors.stockItemId ? (
              <Text style={styles.fieldErrorText}>{formErrors.stockItemId}</Text>
            ) : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              الكمية
              {form.stockItemId
                ? ` (${getStockUnitLabel(
                    stockBalances.find((b) => b.item.id === form.stockItemId)?.item?.unit
                  )})`
                : ""}
            </Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              placeholderTextColor="#64748b"
              value={form.stockQuantity?.toString() || ""}
              onChangeText={(text) => {
                setFormErrors((e) => ({ ...e, stockQuantity: undefined }));
                setForm((p) => ({ ...p, stockQuantity: text }));
              }}
              keyboardType="numeric"
              error={formErrors.stockQuantity}
            />
          </View>
          {stockPreviewAmount != null && (
            <Text style={{ color: "#fb923c", textAlign: "center", marginBottom: 12 }}>
              المبلغ على العميل (متوسط التكلفة): {fmt(stockPreviewAmount)} {CURRENCY}
            </Text>
          )}
          {form.stockItemId && (
            <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 8, textAlign: "center" }}>
              البند: {stockBalances.find((b) => b.item.id === form.stockItemId)?.item?.expenseCat || "—"}
            </Text>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
      {form.txType === "expense" && !isWarehouseExpense && form.cat === "مصنعية" && workers.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>👷 الصنايعي</Text>
          <View style={styles.optionsGrid}>
            {workers.map((w) => (
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
        !isWarehouseExpense &&
        (form.cat === "قماش" || form.cat === "خشب وكلف") &&
        suppliers.length > 0 && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>🏭 المورد</Text>
            <View style={styles.optionsGrid}>
              {suppliers.map((s) => (
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
        <Text style={styles.btnText}>
          {form.editTxId
            ? "حفظ التعديلات ✓"
            : isWarehouseExpense
              ? "صرف من المخزن وحفظ ✓"
              : "حفظ ✓"}
        </Text>
      </TouchableOpacity>
      {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
    </CustomModal>
    </View>
  );
}
