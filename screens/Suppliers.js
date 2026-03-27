import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getSuppliers, getClients, deleteSupplier as dbDeleteSupplier, upsertSupplier } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import SupplierDetail from "./SupplierDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";

export default function Suppliers() {
  const { loaded, modal, setForm, setModal, form } = useApp();

  const deleteSupplier = async (id) => {
    try {
      await dbDeleteSupplier(id);
    } catch (_) {}
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

  const [suppliers, setSuppliers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

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

  const supplierModal = (
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
