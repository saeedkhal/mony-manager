import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView } from "react-native";
import CustomModal from "./Modal";
import { useApp } from "../context/AppContext";
import {
  getClients,
  getWorkers,
  getSuppliers,
  getActiveFiscalYear,
  getActiveFiscalYearId,
  getClientWithTxs,
  upsertClient,
  upsertGeneralTx,
  upsertWorker,
  upsertSupplier,
} from "../utils/db";
import {
  CURRENCY,
  CLIENT_EXPENSE_CATS,
  GENERAL_EXPENSE_CATS,
  PROJECT_TYPES,
} from "../constants";
import styles from "../styles/AppStyles";

export default function Modals() {
  const {
    modal,
    setModal,
    form,
    setForm,
    showClientPicker,
    setShowClientPicker,
    loaded,
    activeFY,
    customFYs,
    refreshClients,
    refreshGeneral,
    persistSettings,
  } = useApp();

  const [clients, setClients] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    Promise.all([getClients(), getWorkers(), getSuppliers()])
      .then(([c, w, s]) => {
        if (!cancelled) {
          setClients(c || []);
          setWorkers(w || []);
          setSuppliers(s || []);
        }
      })
      .catch(() => {
        if (!cancelled) setClients([]);
        if (!cancelled) setWorkers([]);
        if (!cancelled) setSuppliers([]);
      });
    return () => { cancelled = true; };
  }, [loaded, modal]);

  const saveClient = async () => {
    if (!form.name?.trim()) return;
    await getActiveFiscalYear();
    const fiscalYearId = await getActiveFiscalYearId();
    const newClient = {
      id: Date.now(),
      name: form.name.trim(),
      project: form.project || PROJECT_TYPES[0],
      status: "active",
      note: form.note || "",
      fiscalYearId: fiscalYearId ?? null,
      createdAt: new Date().toISOString().split("T")[0],
      txs: [],
    };
    try {
      await upsertClient(newClient);
      refreshClients();
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveClientTx = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const targetClientId = form.clientId;
    const client = await getClientWithTxs(targetClientId);
    if (!client) return;
    const tx = { type: form.txType, amount: Number(form.amount), cat: form.cat, note: form.note || "", date };
    if (form.workerId) tx.workerId = form.workerId;
    if (form.supplierId) tx.supplierId = form.supplierId;
    let updatedClient;
    if (form.editTxId) {
      tx.id = form.editTxId;
      updatedClient = {
        ...client,
        txs: (client.txs || []).map((t) => (t.id === form.editTxId ? tx : t)),
      };
    } else {
      tx.id = Date.now();
      updatedClient = { ...client, txs: [...(client.txs || []), tx] };
    }
    try {
      await upsertClient(updatedClient);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveGeneral = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    await getActiveFiscalYear();
    const fiscalYearId = await getActiveFiscalYearId();
    const tx = {
      id: form.editTxId || Date.now(),
      amount: Number(form.amount),
      cat: form.cat || GENERAL_EXPENSE_CATS[0],
      note: form.note || "",
      date,
      fiscalYearId: fiscalYearId ?? null,
    };
    try {
      await upsertGeneralTx(tx);
      refreshGeneral();
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveWorker = async () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      const list = await getWorkers();
      const w = list.find((x) => x.id === form.editId);
      if (!w) return;
      const updated = { ...w, name: form.name.trim(), phone: form.phone || "" };
      try {
        await upsertWorker(updated);
      } catch (_) {}
    } else {
      const newWorker = { id: Date.now(), name: form.name.trim(), phone: form.phone || "" };
      try {
        await upsertWorker(newWorker);
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const saveSupplier = async () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      const list = await getSuppliers();
      const s = list.find((x) => x.id === form.editId);
      if (!s) return;
      const updated = {
        ...s,
        name: form.name.trim(),
        phone: form.phone || "",
        category: form.category || "",
      };
      try {
        await upsertSupplier(updated);
      } catch (_) {}
    } else {
      const newSupplier = {
        id: Date.now(),
        name: form.name.trim(),
        phone: form.phone || "",
        category: form.category || "",
      };
      try {
        await upsertSupplier(newSupplier);
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const activeClient = clients.find((c) => c.id === form.clientId);

  return (
    <>
      <CustomModal visible={modal === "addClient"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>👤 إضافة عميل جديد</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>اسم العميل</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: أحمد محمد"
            placeholderTextColor="#64748b"
            value={form.name || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder="أي تفاصيل إضافية"
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>نوع المشروع</Text>
          <View style={styles.optionsGrid}>
            {PROJECT_TYPES.map((pt) => (
              <TouchableOpacity
                key={pt}
                style={[styles.optionBtn, form.project === pt && styles.optionBtnActive]}
                onPress={() => setForm((p) => ({ ...p, project: pt }))}
              >
                <Text style={[styles.optionBtnText, form.project === pt && styles.optionBtnTextActive]}>
                  {pt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.modalSaveBtn]} onPress={saveClient}>
          <Text style={styles.btnText}>حفظ العميل ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal visible={modal === "addClientTx"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>
          {form.editTxId
            ? "✏️ تعديل معاملة"
            : form.txType === "income"
            ? "💵 دفعة مستلمة"
            : "🔨 مصروف على العميل"}
        </Text>
        <Text style={styles.modalSubtitle}>
          العميل: {activeClient?.name} — {activeFY}
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
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            value={form.date || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
          />
        </View>
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

      <CustomModal visible={modal === "addGeneral"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>🏢 مصروف عام — {activeFY}</Text>
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
            {GENERAL_EXPENSE_CATS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.optionBtn,
                  form.cat === cat && [styles.optionBtnActive, { backgroundColor: "#f43f5e" }],
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
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            value={form.date || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnGeneral, styles.modalSaveBtn]} onPress={saveGeneral}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal visible={modal === "addWorker"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>👷 {form.editId ? "تعديل" : "إضافة"} صنايعي</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>الاسم</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: عمرو"
            placeholderTextColor="#64748b"
            value={form.name || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>رقم التليفون (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder="01xxxxxxxxx"
            placeholderTextColor="#64748b"
            value={form.phone || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, phone: text }))}
            keyboardType="phone-pad"
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveWorker}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal visible={modal === "addSupplier"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>🏭 {form.editId ? "تعديل" : "إضافة"} مورد</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>اسم المورد</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: مورد الأخشاب"
            placeholderTextColor="#64748b"
            value={form.name || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>الفئة (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: قماش، خشب"
            placeholderTextColor="#64748b"
            value={form.category || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, category: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>رقم التليفون (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder="01xxxxxxxxx"
            placeholderTextColor="#64748b"
            value={form.phone || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, phone: text }))}
            keyboardType="phone-pad"
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnSupplier, styles.modalSaveBtn]} onPress={saveSupplier}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "addWorkerTx"}
        onClose={() => {
          setModal(null);
          setShowClientPicker(false);
        }}
      >
        <Text style={styles.modalTitle}>
          🔨 إضافة مصروف لـ {workers.find((w) => w.id === form.workerId)?.name}
        </Text>
        <Text style={styles.modalSubtitle}>اختر العميل وأدخل تفاصيل المصروف</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>👤 العميل</Text>
          <View style={styles.pickerContainer}>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowClientPicker((p) => !p)}>
              <Text style={[styles.pickerBtnText, form.clientId && { color: "#818cf8" }]}>
                {form.clientId
                  ? clients.find((c) => c.id === form.clientId)?.name || "-- اختر العميل --"
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
                      setForm((p) => ({ ...p, clientId: null }));
                      setShowClientPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, !form.clientId && styles.pickerItemTextActive]}>
                      -- اختر العميل --
                    </Text>
                  </TouchableOpacity>
                  {clients.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pickerItem, form.clientId === c.id && styles.pickerItemActive]}
                      onPress={() => {
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
        </View>
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
          <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            value={form.date || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveClientTx}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "addSupplierTx"}
        onClose={() => {
          setModal(null);
          setShowClientPicker(false);
        }}
      >
        <Text style={styles.modalTitle}>
          🔨 إضافة مشتريات من {suppliers.find((s) => s.id === form.supplierId)?.name}
        </Text>
        <Text style={styles.modalSubtitle}>اختر العميل وأدخل تفاصيل المشتريات</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>👤 العميل</Text>
          <View style={styles.pickerContainer}>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowClientPicker((p) => !p)}>
              <Text style={[styles.pickerBtnText, form.clientId && { color: "#818cf8" }]}>
                {form.clientId
                  ? clients.find((c) => c.id === form.clientId)?.name || "-- اختر العميل --"
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
                      setForm((p) => ({ ...p, clientId: null }));
                      setShowClientPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, !form.clientId && styles.pickerItemTextActive]}>
                      -- اختر العميل --
                    </Text>
                  </TouchableOpacity>
                  {clients.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pickerItem, form.clientId === c.id && styles.pickerItemActive]}
                      onPress={() => {
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
        </View>
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
          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor="#64748b"
            value={form.note || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>التاريخ</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
            value={form.date || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnSupplier, styles.modalSaveBtn]} onPress={saveClientTx}>
          <Text style={styles.btnText}>حفظ ✓</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal visible={modal === "addFY"} onClose={() => setModal(null)}>
        <Text style={styles.modalTitle}>📅 إضافة سنة مالية</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>السنة المالية (مثال: 2025/2026)</Text>
          <TextInput
            style={styles.input}
            placeholder="2025/2026"
            placeholderTextColor="#64748b"
            value={form.customFY || ""}
            onChangeText={(text) => setForm((p) => ({ ...p, customFY: text.trim() }))}
          />
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.modalSaveBtn]}
          onPress={async () => {
            const val = (form.customFY || "").trim();
            const match = val.match(/^(\d{4})\/(\d{4})$/);
            if (match) {
              const a = parseInt(match[1], 10);
              const b = parseInt(match[2], 10);
              if (b === a + 1 && !(customFYs || []).includes(val)) {
                await persistSettings({ customFYs: [...(customFYs || []), val] });
                setForm((p) => ({ ...p, customFY: "" }));
                setModal(null);
              }
            }
          }}
        >
          <Text style={styles.btnText}>إضافة السنة ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
