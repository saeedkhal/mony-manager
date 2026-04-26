import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients, getWorkers, getClientWithTxs, upsertClient } from "../utils/db";
import { CURRENCY, CLIENT_EXPENSE_CATS } from "../constants";
import { fmt } from "../utils/helpers";
import { FORM_MSG, parsePositiveAmount, isValidDateYmd, trimmed } from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";

export default function SupplierDetail({ selectedSupplier, setSelectedSupplier }) {
  const {
    loaded,
    activeFiscalYearLabel,
    setForm,
    setModal,
    deleteClientTx,
    modal,
    form,
    showClientPicker,
    setShowClientPicker,
  } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txClients, setTxClients] = useState([]);
  const [txWorkers, setTxWorkers] = useState([]);
  const [txSuppliers, setTxSuppliers] = useState([]);

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
    Promise.all([getClients(), getWorkers(), getSuppliers()])
      .then(([c, w, s]) => {
        if (!cancelled) {
          setTxClients(c || []);
          setTxWorkers(w || []);
          setTxSuppliers(s || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxClients([]);
          setTxWorkers([]);
          setTxSuppliers([]);
        }
      });
    return () => { cancelled = true; };
  }, [loaded, modal]);

  const saveClientTx = async () => {
    const err = {};
    const num = parsePositiveAmount(form.amount);
    if (num == null) err.amount = FORM_MSG.amount;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
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

  const activeClientTxName = txClients.find((c) => c.id === form.clientId)?.name;

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
    <>
      <ScreenLayout>
        <View style={styles.supplierDetail}>
          <View style={styles.clientDetailBackRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedSupplier(null)}>
              <Text style={styles.backBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.backBtnText}> رجوع</Text>
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
            </Text>
            <Text style={styles.supplierDetailStatsValue}>
              {fmt(activeSupplier.total)} {CURRENCY}
            </Text>
            <Text style={styles.supplierDetailStatsCount}>
              {activeSupplier.count} معاملة
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.btnSupplier, { width: "100%", marginBottom: 20 }]}
            onPress={() => {
              setFormErrors({});
              setForm({
                txType: "expense",
                cat: activeSupplier.category || "قماش",
                supplierId: activeSupplier.id,
                date: new Date().toISOString().split("T")[0],
              });
              setModal("addSupplierTx");
            }}
          >
            <Text style={styles.btnText}>+ إضافة مشتريات من {activeSupplier.name}</Text>
          </TouchableOpacity>

          {activeSupplier.txs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>لا توجد معاملات</Text>
            </View>
          ) : (
            <View style={styles.txList}>
              {[...activeSupplier.txs].reverse().map((tx) => (
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
        }}
      >
        <Text style={styles.modalTitle}>
          🔨 إضافة مشتريات من {txSuppliers.find((s) => s.id === form.supplierId)?.name}
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>👤 العميل</Text>
          <View style={styles.pickerContainer}>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowClientPicker((p) => !p)}>
              <Text style={[styles.pickerBtnText, form.clientId && { color: "#818cf8" }]}>
                {form.clientId
                  ? txClients.find((c) => c.id === form.clientId)?.name || "-- اختر العميل --"
                  : "-- اختر العميل --"}
              </Text>
              <Text style={styles.pickerBtnArrow}>▾</Text>
            </TouchableOpacity>
            {showClientPicker && (
              <View style={styles.pickerDropdown}>
                <ScrollView style={styles.pickerList}>
                  <TouchableOpacity
                    style={[styles.pickerItem, !form.clientId && styles.pickerItemActive]}
                    onPress={() => {
                      setFormErrors((e) => ({ ...e, clientId: undefined }));
                      setForm((p) => ({ ...p, clientId: null }));
                      setShowClientPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, !form.clientId && styles.pickerItemTextActive]}>
                      -- اختر العميل --
                    </Text>
                  </TouchableOpacity>
                  {txClients.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pickerItem, form.clientId === c.id && styles.pickerItemActive]}
                      onPress={() => {
                        setFormErrors((e) => ({ ...e, clientId: undefined }));
                        setForm((p) => ({ ...p, clientId: c.id }));
                        setShowClientPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          form.clientId === c.id && styles.pickerItemTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
          {formErrors.clientId ? <Text style={styles.fieldErrorText}>{formErrors.clientId}</Text> : null}
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
        <TouchableOpacity style={[styles.btn, styles.btnSupplier, styles.modalSaveBtn]} onPress={saveClientTx}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
