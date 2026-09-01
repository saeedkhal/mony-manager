import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, BackHandler } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getWorkers,
  getSuppliers,
  getClientWithTxs,
  upsertClient,
  getWorkerLedger,
  upsertWorkerTx,
  deleteWorkerTx,
  getActiveFiscalYearId,
} from "../utils/db";
import { CURRENCY, CLIENT_EXPENSE_CATS, WORKER_LEDGER_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import ClientSearchSelect from "../components/ClientSearchSelect";

const LEDGER_PAGE_SIZE = 5;

export default function WorkerDetail({ selectedWorker, setSelectedWorker }) {
  const {
    loaded,
    setForm,
    setModal,
    deleteClientTx,
    modal,
    form,
    setShowClientPicker,
    activeFiscalYearLabel,
    activeFiscalYearId,
  } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txWorkers, setTxWorkers] = useState([]);
  const [txSuppliers, setTxSuppliers] = useState([]);
  const [ledger, setLedger] = useState({
    dueTotal: 0,
    payoutTotal: 0,
    clientPaidTotal: 0,
    paidTotal: 0,
    balance: 0,
    entries: [],
  });
  const [ledgerTick, setLedgerTick] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);

  const reloadLedger = useCallback(async () => {
    if (selectedWorker == null) return;
    const [w, led] = await Promise.all([
      getWorkers(),
      getWorkerLedger(selectedWorker, activeFiscalYearId),
    ]);
    setWorkers(w || []);
    setLedger(
      led || {
        dueTotal: 0,
        payoutTotal: 0,
        clientPaidTotal: 0,
        paidTotal: 0,
        balance: 0,
        entries: [],
      }
    );
  }, [selectedWorker, activeFiscalYearId]);

  useEffect(() => {
    if (!loaded || selectedWorker == null) return;
    let cancelled = false;
    setLoading(true);
    reloadLedger()
      .catch(() => {
        if (!cancelled) {
          setWorkers([]);
          setLedger({
            dueTotal: 0,
            payoutTotal: 0,
            clientPaidTotal: 0,
            paidTotal: 0,
            balance: 0,
            entries: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedWorker, reloadLedger, ledgerTick]);

  useEffect(() => {
    if (!loaded || (modal !== "addClientTx" && modal !== "addWorkerTx")) return;
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
    return () => {
      cancelled = true;
    };
  }, [loaded, modal]);

  const saveClientTx = async () => {
    const err = {};
    const num = parsePositiveAmount(form.amount);
    if (num == null) err.amount = FORM_MSG.amount;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    if (!form.clientId) err.clientId = FORM_MSG.client;
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
      return false;
    }
    setFormErrors({});
    const c = await getClientWithTxs(form.clientId);
    if (!c) return false;
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
      setLedgerTick((n) => n + 1);
    } catch (_) {
      return false;
    }
    setModal(null);
    setShowClientPicker(false);
    setForm({});
    return true;
  };

  const saveWorkerLedgerTx = async () => {
    const err = {};
    const num = parsePositiveAmount(form.amount);
    if (num == null) err.amount = FORM_MSG.amount;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    const cat = form.cat || "سلفة";
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setFormErrors({});

    const isClientMasnaeya = cat === "مصنعية" && form.clientId;
    if (isClientMasnaeya) {
      const pendingWorkerTxId = form.editWorkerTxId;
      const ok = await saveClientTx();
      if (ok && pendingWorkerTxId) {
        try {
          await deleteWorkerTx(pendingWorkerTxId);
          setLedgerTick((n) => n + 1);
        } catch (_) {}
      }
      return;
    }

    const kind = cat === "مستحق" ? "due" : "payout";
    const fyId = form.fiscalYearId != null ? form.fiscalYearId : await getActiveFiscalYearId();
    try {
      await upsertWorkerTx({
        id: form.editWorkerTxId || Date.now(),
        workerId: form.workerId,
        kind,
        amount: num,
        cat,
        note: form.note || "",
        date,
        fiscalYearId: fyId ?? null,
        clientId: cat === "مصنعية" ? form.clientId ?? null : null,
      });
      setLedgerTick((n) => n + 1);
    } catch (_) {}
    setModal(null);
    setShowClientPicker(false);
    setForm({});
  };

  const openLedgerForm = (cat, editEntry = null) => {
    setFormErrors({});
    const today = new Date().toISOString().split("T")[0];
    if (editEntry?.source === "ledger") {
      setForm({
        workerId: selectedWorker,
        cat: editEntry.cat || cat,
        amount: String(editEntry.amount ?? ""),
        note: editEntry.note || "",
        date: editEntry.date || today,
        clientId: editEntry.clientId ?? null,
        clientName: editEntry.clientName || "",
        editWorkerTxId: editEntry.id,
        fiscalYearId: editEntry.fiscalYearId,
        txType: "expense",
      });
    } else {
      setForm({
        workerId: selectedWorker,
        cat,
        date: today,
        txType: "expense",
      });
    }
    setModal("addWorkerTx");
  };

  const activeWorker = useMemo(
    () => (selectedWorker ? (workers || []).find((w) => w.id === selectedWorker) : null),
    [workers, selectedWorker]
  );

  const sortedEntries = useMemo(() => {
    return [...(ledger.entries || [])].sort((a, b) => {
      const d = String(b.date || "").localeCompare(String(a.date || ""));
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [ledger.entries]);

  const ledgerPageCount = Math.max(1, Math.ceil(sortedEntries.length / LEDGER_PAGE_SIZE));

  useEffect(() => {
    setLedgerPage(0);
    setRowMenuId(null);
    setRowMenuPos(null);
  }, [selectedWorker, activeFiscalYearId]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedEntries.length / LEDGER_PAGE_SIZE) - 1);
    if (ledgerPage > maxPage) setLedgerPage(maxPage);
  }, [sortedEntries.length, ledgerPage]);

  const pagedEntries = useMemo(() => {
    const start = ledgerPage * LEDGER_PAGE_SIZE;
    return sortedEntries.slice(start, start + LEDGER_PAGE_SIZE);
  }, [sortedEntries, ledgerPage]);

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

  const openEditEntry = (tx) => {
    if (!tx) return;
    if (tx.source === "client") {
      setForm({
        editTxId: tx.clientTxId,
        clientId: tx.clientId,
        clientName: tx.clientName || "",
        txType: "expense",
        amount: tx.amount,
        cat: tx.cat,
        note: tx.note || "",
        date: tx.date,
        workerId: selectedWorker,
      });
      setFormErrors({});
      setModal("addClientTx");
      return;
    }
    openLedgerForm(tx.cat || "سلفة", tx);
  };

  const removeEntry = async (tx) => {
    if (!tx) return;
    try {
      if (tx.source === "client") {
        await deleteClientTx(tx.clientId, tx.clientTxId);
      } else {
        await deleteWorkerTx(tx.id);
      }
      setLedgerTick((n) => n + 1);
    } catch (_) {}
  };

  const balanceColor =
    ledger.balance > 0 ? "#f59e0b" : ledger.balance < 0 ? "#f43f5e" : "#10b981";
  const balanceLabel = ledger.balance > 0 ? "له" : ledger.balance < 0 ? "عليه" : "متساوي";

  if (!selectedWorker) return null;
  if (loading) {
    return (
      <ScreenLayout>
        <View style={styles.workerDetail}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </ScreenLayout>
    );
  }
  if (!activeWorker) return null;

  return (
    <View style={{ flex: 1 }} ref={listRootRef}>
      <ScreenLayout>
        <View style={styles.workerDetail}>
          <View style={styles.clientDetailBackRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedWorker(null)}>
              <Text style={styles.backBtnText}>←</Text>
              <Text style={styles.backBtnText}>رجوع</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.clientDetailHeaderStack}>
            <Text style={styles.clientDetailName} numberOfLines={2}>
              👷 {activeWorker.name}
            </Text>
            {activeWorker.phone ? (
              <Text style={styles.clientDetailMeta}>📞 {activeWorker.phone}</Text>
            ) : null}
            <Text style={styles.clientDetailMeta}>السنة المالية {activeFiscalYearLabel}</Text>
            <TouchableOpacity
              style={[styles.editBtn, styles.clientDetailHeaderBtn]}
              onPress={() => {
                setForm({ editId: activeWorker.id, name: activeWorker.name, phone: activeWorker.phone });
                setModal("addWorker");
              }}
            >
              <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGeneralIncome, { flex: 1 }]}
              onPress={() => openLedgerForm("مستحق")}
            >
              <Text style={styles.btnText}>+ مستحق له</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnWorker, { flex: 1 }]}
              onPress={() => openLedgerForm("سلفة")}
            >
              <Text style={styles.btnText}>+ صرف / سلفة</Text>
            </TouchableOpacity>
          </View>

          {sortedEntries.length === 0 ? (
            <View>
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>لا توجد حركات في الدفتر</Text>
              </View>
              <View style={styles.clientDetailStats}>
                <View style={[styles.clientDetailStatCard, { borderColor: "rgba(16,185,129,0.35)" }]}>
                  <Text style={styles.clientDetailStatLabel}>له</Text>
                  <Text style={[styles.clientDetailStatValue, { color: "#10b981" }]}>
                    {fmt(ledger.dueTotal)} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.clientDetailStatCard, { borderColor: "rgba(251,146,60,0.35)" }]}>
                  <Text style={styles.clientDetailStatLabel}>تم استلام</Text>
                  <Text style={[styles.clientDetailStatValue, { color: "#fb923c" }]}>
                    {fmt(ledger.paidTotal)} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.clientDetailStatCard, { borderColor: balanceColor + "55" }]}>
                  <Text style={styles.clientDetailStatLabel}>الباقي ({balanceLabel})</Text>
                  <Text style={[styles.clientDetailStatValue, { color: balanceColor }]}>
                    {fmt(Math.abs(ledger.balance))} {CURRENCY}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.stockTableCard}>
              <View style={styles.stockTableHeader}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                    الحركة
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
              {pagedEntries.map((tx, index) => {
                const isDue = tx.source === "ledger" && tx.kind === "due";
                const isLast = index === pagedEntries.length - 1;
                return (
                  <View
                    key={tx.id}
                    style={[
                      styles.stockTableRow,
                      index % 2 === 1 && styles.stockTableRowAlt,
                      isLast && ledgerPageCount <= 1 && styles.stockTableRowLast,
                    ]}
                  >
                    <View style={[styles.stockTableCol, styles.stockTableColName]}>
                      <Text
                        style={[styles.stockTableCellName, { color: isDue ? "#10b981" : "#fb923c" }]}
                        numberOfLines={1}
                      >
                        {tx.cat || (isDue ? "مستحق" : "صرف")}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                      <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                        {tx.date || "—"}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                      <Text
                        style={[
                          styles.stockTableCell,
                          styles.stockTableCellCenter,
                          { color: isDue ? "#10b981" : "#fb923c" },
                        ]}
                        numberOfLines={1}
                      >
                        {isDue ? "+" : "-"}
                        {fmt(tx.amount)} {CURRENCY}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                      <View
                        collapsable={false}
                        ref={(el) => {
                          if (el) menuBtnRefs.current[tx.id] = el;
                          else delete menuBtnRefs.current[tx.id];
                        }}
                      >
                        <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(tx)}>
                          <Text style={styles.stockMenuBtnText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={styles.stockTableFooter}>
                <View style={[styles.stockTableCol, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }]}>
                  <Text style={[styles.stockTableCellSub, styles.stockTableCellCenter]}>له</Text>
                  <Text
                    style={[
                      styles.stockTableFooterText,
                      styles.stockTableCellCenter,
                      { color: "#10b981", width: "100%" },
                    ]}
                    numberOfLines={1}
                  >
                    {fmt(ledger.dueTotal)} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }]}>
                  <Text style={[styles.stockTableCellSub, styles.stockTableCellCenter]}>تم استلام</Text>
                  <Text
                    style={[
                      styles.stockTableFooterText,
                      styles.stockTableCellCenter,
                      { color: "#fb923c", width: "100%" },
                    ]}
                    numberOfLines={1}
                  >
                    {fmt(ledger.paidTotal)} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }]}>
                  <Text style={[styles.stockTableCellSub, styles.stockTableCellCenter]}>
                    الباقي ({balanceLabel})
                  </Text>
                  <Text
                    style={[
                      styles.stockTableFooterText,
                      styles.stockTableCellCenter,
                      { color: balanceColor, width: "100%" },
                    ]}
                    numberOfLines={1}
                  >
                    {fmt(Math.abs(ledger.balance))} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColMenu]} />
              </View>
              {ledgerPageCount > 1 ? (
                <View style={styles.stockTablePager}>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      ledgerPage === 0 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => {
                      closeRowMenu();
                      setLedgerPage((p) => Math.max(0, p - 1));
                    }}
                    disabled={ledgerPage === 0}
                  >
                    <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                  </TouchableOpacity>
                  <Text style={styles.stockTablePagerInfo}>
                    صفحة {ledgerPage + 1} من {ledgerPageCount}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      ledgerPage >= ledgerPageCount - 1 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => {
                      closeRowMenu();
                      setLedgerPage((p) => Math.min(ledgerPageCount - 1, p + 1));
                    }}
                    disabled={ledgerPage >= ledgerPageCount - 1}
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
        <Text style={styles.modalTitle}>{form.editTxId ? "✏️ تعديل معاملة" : "🔨 مصروف على العميل"}</Text>
        <Text style={styles.modalSubtitle}>
          العميل: {form.clientName} — {activeFiscalYearLabel}
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
            {CLIENT_EXPENSE_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && styles.optionBtnActive,
                  form.cat === cat && { backgroundColor: "#f43f5e" },
                ]}
                onPress={() => {
                  setFormErrors((e) => ({ ...e, workerId: undefined, supplierId: undefined }));
                  setForm((p) => ({ ...p, cat, workerId: cat === "مصنعية" ? selectedWorker : undefined }));
                }}
              >
                <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {form.cat === "مصنعية" && txWorkers.length > 0 && (
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
        <TouchableOpacity style={[styles.btn, styles.btnExpense, styles.modalSaveBtn]} onPress={saveClientTx}>
          <Text style={styles.btnText}>{form.editTxId ? "حفظ التعديلات ✓" : "حفظ ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "addWorkerTx"}
        onClose={() => {
          setFormErrors({});
          setModal(null);
          setShowClientPicker(false);
        }}
      >
        <Text style={styles.modalTitle}>
          {form.editWorkerTxId ? "✏️ تعديل حركة" : "دفتر"} {activeWorker.name}
        </Text>
        <Text style={styles.modalSubtitle}>العميل للمصنعية فقط — السلفة وباقي الراتب من غير عميل</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>نوع الحركة</Text>
          <View style={styles.optionsGrid}>
            {WORKER_LEDGER_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && styles.optionBtnActive,
                  form.cat === cat && cat === "مستحق" && { backgroundColor: "#10b981" },
                  form.cat === cat && cat !== "مستحق" && { backgroundColor: "#f59e0b" },
                ]}
                onPress={() => {
                  setFormErrors((e) => ({ ...e, clientId: undefined }));
                  setForm((p) => ({
                    ...p,
                    cat,
                    clientId: cat === "مصنعية" ? p.clientId : null,
                    clientName: cat === "مصنعية" ? p.clientName : "",
                  }));
                }}
              >
                <Text style={[styles.optionBtnText, form.cat === cat && styles.optionBtnTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {form.cat === "مصنعية" ? (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👤 العميل (اختياري)</Text>
            <ClientSearchSelect
              styles={styles}
              value={form.clientId}
              selectedLabel={form.clientName || ""}
              error={formErrors.clientId}
              active={modal === "addWorkerTx"}
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
        ) : null}
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
          active={modal === "addWorkerTx"}
          error={formErrors.date}
        />
        <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveWorkerLedgerTx}>
          <Text style={styles.btnText}>{form.editWorkerTxId ? "حفظ التعديلات ✓" : "حفظ ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>
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
                openEditEntry(tx);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const tx = rowMenuPos.tx;
                closeRowMenu();
                removeEntry(tx);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#f43f5e" }]}>مسح</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
