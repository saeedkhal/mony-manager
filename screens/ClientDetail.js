import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
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

export default function ClientDetail({ selectedClient, setSelectedClient, onClientDeleted }) {
  const { activeFY, deleteClientTx, setForm, setModal } = useApp();

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

  const toggleStatus = async (cid) => {
    const c = await getClientWithTxs(cid);
    if (!c) return;
    const updated = { ...c, status: c.status === "active" ? "done" : "active" };
    try {
      await upsertClient(updated);
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

  const totals = useMemo(() => {
    if (!client) return { income: 0, expense: 0, profit: 0 };
    const txs = client.txs || [];
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, profit: income - expense };
  }, [client]);

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || "غير محدد";
  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "غير محدد";

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
          {client.project} — السنة المالية {activeFY}
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
  );
}
