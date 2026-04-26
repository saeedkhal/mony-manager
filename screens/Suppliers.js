import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients, deleteSupplier as dbDeleteSupplier, upsertSupplier } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import SupplierDetail from "./SupplierDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

export default function Suppliers() {
  const { loaded, modal, setForm, setModal, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const deleteSupplier = async (id) => {
    try {
      await dbDeleteSupplier(id);
    } catch (_) {}
  };

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
  }, [loaded, modal]);

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

  const saveSupplier = async () => {
    if (!trimmed(form.name)) {
      setFormErrors({ name: FORM_MSG.required });
      return;
    }
    setFormErrors({});
    try {
      if (form.editId) {
        const list = await getSuppliers();
        const s = list.find((x) => x.id === form.editId);
        if (!s) return;
        await upsertSupplier({
          ...s,
          name: form.name.trim(),
          phone: form.phone || "",
          category: form.category || "",
        });
      } else {
        await upsertSupplier({
          id: Date.now(),
          name: form.name.trim(),
          phone: form.phone || "",
          category: form.category || "",
        });
      }
      const [sup, c] = await Promise.all([getSuppliers(), getClients()]);
      setSuppliers(sup || []);
      setClients(c || []);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const supplierModal = (
    <CustomModal
      visible={modal === "addSupplier"}
      onClose={() => {
        setFormErrors({});
        setModal(null);
      }}
      centered
    >
      <Text style={styles.modalTitle}>🏭 {form.editId ? "تعديل" : "إضافة"} مورد</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>اسم المورد</Text>
        <FormTextInput
          styles={styles}
          placeholder="مثال: مورد الأخشاب"
          placeholderTextColor="#64748b"
          value={form.name || ""}
          onChangeText={(text) => {
            setFormErrors((e) => ({ ...e, name: undefined }));
            setForm((p) => ({ ...p, name: text }));
          }}
          error={formErrors.name}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>الفئة (اختياري)</Text>
        <FormTextInput
          styles={styles}
          placeholder="مثال: قماش، خشب"
          placeholderTextColor="#64748b"
          value={form.category || ""}
          onChangeText={(text) => setForm((p) => ({ ...p, category: text }))}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>رقم التليفون (اختياري)</Text>
        <FormTextInput
          styles={styles}
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
  );

  if (selectedSupplier) {
    return (
      <>
        <SupplierDetail
          selectedSupplier={selectedSupplier}
          setSelectedSupplier={setSelectedSupplier}
        />
        {supplierModal}
      </>
    );
  }

  if (loading) {
    return (
      <>
        <View style={styles.suppliersView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {supplierModal}
      </>
    );
  }

  return (
    <>
      <ScreenLayout>
        <View style={styles.suppliersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSupplier, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              setModal("addSupplier");
            }}
          >
            <Text style={styles.btnText}>+ مورد جديد</Text>
          </TouchableOpacity>
          {suppliers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏭</Text>
              <Text style={styles.emptyText}>لا يوجد موردين بعد</Text>
            </View>
          ) : (
            <View style={styles.suppliersGrid}>
              {supplierStats.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.supplierCard}
                  onPress={() => setSelectedSupplier(s.id)}
                >
                  <View style={styles.supplierCardHeader}>
                    <View>
                      <Text style={styles.supplierCardName}>🏭 {s.name}</Text>
                      {s.category && (
                        <Text style={styles.supplierCardCategory}>{s.category}</Text>
                      )}
                      {s.phone && <Text style={styles.supplierCardPhone}>📞 {s.phone}</Text>}
                    </View>
                    <View style={styles.supplierCardActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          setFormErrors({});
                          setForm({
                            editId: s.id,
                            name: s.name,
                            phone: s.phone,
                            category: s.category,
                          });
                          setModal("addSupplier");
                        }}
                      >
                        <Text style={styles.iconBtnText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconBtn, styles.iconBtnDanger]}
                        onPress={async (e) => {
                          e.stopPropagation();
                          await deleteSupplier(s.id);
                          if (selectedSupplier === s.id) setSelectedSupplier(null);
                        }}
                      >
                        <Text style={styles.iconBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.supplierCardStats}>
                    <Text style={styles.supplierCardStatsLabel}>إجمالي المشتريات</Text>
                    <Text style={styles.supplierCardStatsValue}>
                      {fmt(s.total)} {CURRENCY}
                    </Text>
                    <Text style={styles.supplierCardStatsCount}>{s.count} معاملة</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScreenLayout>
      {supplierModal}
    </>
  );
}
