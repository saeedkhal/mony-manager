import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getClientWithTxs,
  getWorkers,
  getSuppliers,
  upsertClient,
  deleteClient as dbDeleteClient,
} from "../utils/db";
import { CURRENCY, STATUS_LABELS, CLIENT_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";

export default function ClientDetail({ selectedClient, setSelectedClient, onClientDeleted }) {
  const { activeFiscalYearLabel, deleteClientTx, setForm, setModal, modal, form } = useApp();

  const openClientTx = (cid, txType, editTx = null) => {
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
      });
    } else {
      setForm({
        clientId: cid,
        txType,
        cat: txType === "income" ? "مقدم" : CLIENT_EXPENSE_CATS[0],
        date: new Date().toISOString().split("T")[0],
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
    ])
      .then(([c, w, s]) => {
        if (!cancelled) {
          setClient(c || null);
          setWorkers(w || []);
          setSuppliers(s || []);
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
  }, [selectedClient]);

  const refetchClientScreen = async () => {
    if (!selectedClient) return;
    try {
      const [c, w, s] = await Promise.all([
        getClientWithTxs(selectedClient),
        getWorkers(),
        getSuppliers(),
      ]);
      setClient(c || null);
      setWorkers(w || []);
      setSuppliers(s || []);
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
    if (!client) return { income: 0, expense: 0, profit: 0 };
    const txs = client.txs || [];
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, profit: income - expense };
  }, [client]);

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || "غير محدد";
  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "غير محدد";

  const saveClientTx = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const targetClientId = form.clientId;
    const c = await getClientWithTxs(targetClientId);
    if (!c) return;
    const tx = { type: form.txType, amount: Number(form.amount), cat: form.cat, note: form.note || "", date };
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
    <>
    <ScreenLayout>
      <View style={styles.clientDetail}>
      <View style={styles.clientDetailBackRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedClient(null)}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.backBtnText}> رجوع</Text>
      </View>
      <View style={styles.clientDetailHeaderStack}>
        <Text style={styles.clientDetailName} numberOfLines={2}>
          {client.name}
        </Text>
        <Text style={styles.clientDetailMeta}>
          {client.project} — السنة المالية {activeFiscalYearLabel}
        </Text>
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
          ["💵 إجمالي الدخل", "#818cf8", "rgba(129,140,248,0.1)", t.income],
          ["🔨 إجمالي المصروفات", "#fb923c", "rgba(251,146,60,0.1)", t.expense],
          [
            "💰 صافي الربح",
            t.profit >= 0 ? "#10b981" : "#f43f5e",
            t.profit >= 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)",
            t.profit,
          ],
        ].map(([l, col, bg, v]) => (
          <View key={l} style={[styles.clientDetailStatCard, { backgroundColor: bg, borderColor: col + "30" }]}>
            <Text style={styles.clientDetailStatLabel}>{l}</Text>
            <Text style={[styles.clientDetailStatValue, { color: col }]}>
              {fmt(v)} {CURRENCY}
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
                    <TouchableOpacity style={styles.txDeleteBtn} onPress={() => deleteClientTx(client.id, tx.id)}>
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
    <CustomModal visible={modal === "addClientTx"} onClose={() => setModal(null)}>
      <Text style={styles.modalTitle}>
        {form.editTxId
          ? "✏️ تعديل معاملة"
          : form.txType === "income"
            ? "💵 دفعة مستلمة"
            : "🔨 مصروف على العميل"}
      </Text>
      <Text style={styles.modalSubtitle}>
        العميل: {txModalClientName} — {activeFiscalYearLabel}
      </Text>
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
              onPress={() => setForm((p) => ({ ...p, cat, workerId: undefined, supplierId: undefined }))}
            >
              <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {form.txType === "expense" && form.cat === "مصنعية" && workers.length > 0 && (
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
                onPress={() => setForm((p) => ({ ...p, workerId: w.id }))}
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
        </View>
      )}
      {form.txType === "expense" &&
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
                  onPress={() => setForm((p) => ({ ...p, supplierId: s.id }))}
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
          </View>
        )}
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
      <FormDateField
        styles={styles}
        value={form.date}
        onChangeValue={(v) => setForm((p) => ({ ...p, date: v }))}
        active={modal === "addClientTx"}
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
    </>
  );
}
