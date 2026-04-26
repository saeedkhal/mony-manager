import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getSuppliersPage,
  getSupplierPurchaseStatsMap,
  deleteSupplier as dbDeleteSupplier,
  upsertSupplier,
  getSuppliers,
} from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import SupplierDetail from "./SupplierDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

const SUPPLIERS_PAGE_SIZE = 5;

export default function Suppliers() {
  const { loaded, modal, setForm, setModal, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const [suppliers, setSuppliers] = useState([]);
  const [purchaseStatsMap, setPurchaseStatsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  /** Applied name filter only after user taps «بحث» (not while typing). */
  const [appliedSearch, setAppliedSearch] = useState("");
  const listFetchGen = useRef(0);
  const suppliersRef = useRef([]);

  const pageOptions = useMemo(
    () => (appliedSearch ? { nameContains: appliedSearch } : {}),
    [appliedSearch]
  );

  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  useEffect(() => {
    if (!loaded || selectedSupplier != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    setSuppliers([]);
    setHasMore(true);
    setPurchaseStatsMap({});
    Promise.all([
      getSuppliersPage(SUPPLIERS_PAGE_SIZE, 0, pageOptions),
      getSupplierPurchaseStatsMap(),
    ])
      .then(([{ suppliers: first, hasMore: hm }, stats]) => {
        if (cancelled || gen !== listFetchGen.current) return;
        setSuppliers(first || []);
        setHasMore(!!hm);
        setPurchaseStatsMap(stats && typeof stats === "object" ? stats : {});
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setSuppliers([]);
        setHasMore(false);
        setPurchaseStatsMap({});
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedSupplier, pageOptions]);

  const loadMoreSuppliers = useCallback(async () => {
    if (!hasMore || loadingMore || loading || selectedSupplier != null) return;
    const gen = listFetchGen.current;
    const offset = suppliersRef.current.length;
    setLoadingMore(true);
    try {
      const { suppliers: next, hasMore: hm } = await getSuppliersPage(
        SUPPLIERS_PAGE_SIZE,
        offset,
        pageOptions
      );
      if (gen !== listFetchGen.current) return;
      setSuppliers((prev) => [...prev, ...(next || [])]);
      setHasMore(!!hm);
    } catch (_) {
      if (gen === listFetchGen.current) setHasMore(false);
    } finally {
      if (gen === listFetchGen.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, selectedSupplier, pageOptions]);

  const onScrollSuppliers = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreSuppliers();
      }
    },
    [loadMoreSuppliers]
  );

  const supplierStats = useMemo(() => {
    return (suppliers || []).map((s) => {
      const st = purchaseStatsMap[String(s.id)] || { total: 0, count: 0 };
      return { ...s, total: st.total, count: st.count, txs: [] };
    });
  }, [suppliers, purchaseStatsMap]);

  const removeSupplier = async (id) => {
    try {
      await dbDeleteSupplier(id);
      if (String(selectedSupplier) === String(id)) setSelectedSupplier(null);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const [{ suppliers: first, hasMore: hm }, stats] = await Promise.all([
        getSuppliersPage(SUPPLIERS_PAGE_SIZE, 0, pageOptions),
        getSupplierPurchaseStatsMap(),
      ]);
      if (gen === listFetchGen.current) {
        setSuppliers(first || []);
        setHasMore(!!hm);
        setPurchaseStatsMap(stats && typeof stats === "object" ? stats : {});
      }
    } catch (_) {}
  };

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
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const [{ suppliers: first, hasMore: hm }, stats] = await Promise.all([
        getSuppliersPage(SUPPLIERS_PAGE_SIZE, 0, pageOptions),
        getSupplierPurchaseStatsMap(),
      ]);
      if (gen === listFetchGen.current) {
        setSuppliers(first || []);
        setHasMore(!!hm);
        setPurchaseStatsMap(stats && typeof stats === "object" ? stats : {});
      }
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

  if (loading && suppliers.length === 0) {
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
      <ScreenLayout scrollViewProps={{ onScroll: onScrollSuppliers, scrollEventThrottle: 400 }}>
        <View style={styles.suppliersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSupplier, { marginBottom: 12, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              setModal("addSupplier");
            }}
          >
            <Text style={styles.btnText}>+ مورد جديد</Text>
          </TouchableOpacity>
          <View style={[styles.inputGroup, { marginBottom: 12 }]}>
            <Text style={styles.inputLabel}>بحث باسم المورد</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <FormTextInput
                  styles={styles}
                  placeholder="اكتب جزءاً من الاسم ثم اضغط بحث"
                  placeholderTextColor="#64748b"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.btnSupplier, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => setAppliedSearch(trimmed(searchQuery))}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {suppliers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏭</Text>
              <Text style={styles.emptyText}>
                {appliedSearch
                  ? "لا يوجد موردون يطابقون البحث. جرّب اسمًا آخر أو امسح النص واضغط بحث."
                  : "لا يوجد موردين بعد"}
              </Text>
            </View>
          ) : (
            <>
              {appliedSearch ? (
                <Text style={[styles.sectionSubtitle, { marginBottom: 10 }]}>
                  نتائج البحث عن «{appliedSearch}»
                </Text>
              ) : null}
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
                          onPress={(e) => {
                            e.stopPropagation();
                            removeSupplier(s.id);
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
              {loadingMore ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator color="#8b5cf6" />
                  <Text style={[styles.loadingText, { marginTop: 8, fontSize: 13 }]}>جاري التحميل...</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScreenLayout>
      {supplierModal}
    </>
  );
}
