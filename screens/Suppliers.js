import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler, Alert } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getSuppliersPage,
  getSupplierPurchaseStatsMap,
  deleteSupplier as dbDeleteSupplier,
  upsertSupplier,
  getSuppliers,
  DELETE_BLOCKED,
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
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [supplierPage, setSupplierPage] = useState(0);
  const [purchaseStatsMap, setPurchaseStatsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const listFetchGen = useRef(0);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);

  const pageOptions = useMemo(
    () => (appliedSearch ? { nameContains: appliedSearch } : {}),
    [appliedSearch]
  );
  const supplierPageCount = Math.max(1, Math.ceil((supplierTotal || 0) / SUPPLIERS_PAGE_SIZE));

  useEffect(() => {
    setSupplierPage(0);
  }, [appliedSearch]);

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

  const openRowMenu = (supplier) => {
    if (!supplier) return;
    if (Number(rowMenuId) === Number(supplier.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[supplier.id];
    const root = listRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(supplier.id);
      setRowMenuPos({ x, y, w, h, supplier });
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

  const refreshSuppliers = async (page, gen) => {
    const offset = page * SUPPLIERS_PAGE_SIZE;
    const [{ suppliers: rows, total }, stats] = await Promise.all([
      getSuppliersPage(SUPPLIERS_PAGE_SIZE, offset, pageOptions),
      getSupplierPurchaseStatsMap(),
    ]);
    if (gen != null && gen !== listFetchGen.current) return;
    const n = Number(total) || 0;
    const maxPage = Math.max(0, Math.ceil(n / SUPPLIERS_PAGE_SIZE) - 1);
    if (page > maxPage) {
      setSupplierPage(maxPage);
      setSupplierTotal(n);
      return;
    }
    setSuppliers(rows || []);
    setSupplierTotal(n);
    setPurchaseStatsMap(stats && typeof stats === "object" ? stats : {});
  };

  useEffect(() => {
    if (!loaded || selectedSupplier != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    closeRowMenu();
    refreshSuppliers(supplierPage, gen)
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setSuppliers([]);
        setSupplierTotal(0);
        setPurchaseStatsMap({});
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedSupplier, pageOptions, supplierPage]);

  const supplierStats = useMemo(() => {
    return (suppliers || []).map((s) => {
      const st = purchaseStatsMap[String(s.id)] || { total: 0, count: 0 };
      return { ...s, total: st.total, count: st.count };
    });
  }, [suppliers, purchaseStatsMap]);

  const openEditSupplier = (s) => {
    setFormErrors({});
    setForm({
      editId: s.id,
      name: s.name,
      phone: s.phone || "",
      category: s.category || "",
    });
    setModal("addSupplier");
  };

  const removeSupplier = async (id) => {
    try {
      await dbDeleteSupplier(id);
      if (String(selectedSupplier) === String(id)) setSelectedSupplier(null);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      await refreshSuppliers(supplierPage, gen);
    } catch (e) {
      if (e?.code === DELETE_BLOCKED) {
        Alert.alert("لا يمكن الحذف", e.message);
      }
    }
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
      const nextPage = form.editId ? supplierPage : 0;
      if (!form.editId) setSupplierPage(0);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      await refreshSuppliers(nextPage, gen);
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
      <View style={{ flex: 1 }}>
        <SupplierDetail
          selectedSupplier={selectedSupplier}
          setSelectedSupplier={setSelectedSupplier}
        />
        {supplierModal}
      </View>
    );
  }

  if (loading && suppliers.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.suppliersView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {supplierModal}
      </View>
    );
  }

  return (
    <View ref={listRootRef} collapsable={false} style={{ flex: 1 }}>
      <ScreenLayout>
        <View style={styles.suppliersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSupplier, { marginBottom: 12, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              closeRowMenu();
              setModal("addSupplier");
            }}
          >
            <Text style={styles.btnText}>+ مورد جديد</Text>
          </TouchableOpacity>
          <View style={[styles.inputGroup, { marginBottom: 12 }]}>
            <Text style={styles.inputLabel}>بحث بالاسم أو رقم التليفون</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <FormTextInput
                  styles={styles}
                  placeholder="اكتب جزءاً من الاسم أو الرقم ثم اضغط بحث"
                  placeholderTextColor="#64748b"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.btnSupplier, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => {
                  closeRowMenu();
                  setAppliedSearch(trimmed(searchQuery));
                }}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {loading && suppliers.length > 0 ? (
            <View style={{ paddingVertical: 8, alignItems: "center" }}>
              <ActivityIndicator color="#8b5cf6" />
            </View>
          ) : null}
          {suppliers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏭</Text>
              <Text style={styles.emptyText}>
                {appliedSearch
                  ? "لا يوجد موردون يطابقون البحث. جرّب كلمات أخرى أو امسح النص واضغط بحث."
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
              <View style={styles.stockTableCard}>
                <View style={styles.stockTableHeader}>
                  <View style={[styles.stockTableCol, styles.stockTableColName]}>
                    <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                      الاسم
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      التليفون
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      المشتريات
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      {" "}
                    </Text>
                  </View>
                </View>
                {supplierStats.map((s, index) => {
                  const isLast = index === supplierStats.length - 1;
                  const subParts = [s.category, s.count ? `${s.count} معاملة` : null].filter(Boolean);
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.stockTableRow,
                        index % 2 === 1 && styles.stockTableRowAlt,
                        isLast && supplierPageCount <= 1 && styles.stockTableRowLast,
                      ]}
                    >
                      <View style={[styles.stockTableCol, styles.stockTableColName]}>
                        <Text style={styles.stockTableCellName} numberOfLines={2}>
                          {s.name}
                        </Text>
                        {subParts.length > 0 ? (
                          <Text style={styles.stockTableCellSub} numberOfLines={1}>
                            {subParts.join(" • ")}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                        <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                          {s.phone || "—"}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                        <Text
                          style={[styles.stockTableCell, styles.stockTableCellCenter, { color: "#a78bfa" }]}
                          numberOfLines={1}
                        >
                          {fmt(s.total)} {CURRENCY}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                        <View
                          collapsable={false}
                          ref={(el) => {
                            if (el) menuBtnRefs.current[s.id] = el;
                            else delete menuBtnRefs.current[s.id];
                          }}
                        >
                          <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(s)}>
                            <Text style={styles.stockMenuBtnText}>⋮</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {supplierPageCount > 1 ? (
                  <View style={styles.stockTablePager}>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        supplierPage === 0 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setSupplierPage((p) => Math.max(0, p - 1));
                      }}
                      disabled={supplierPage === 0}
                    >
                      <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                    </TouchableOpacity>
                    <Text style={styles.stockTablePagerInfo}>
                      صفحة {supplierPage + 1} من {supplierPageCount}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        supplierPage >= supplierPageCount - 1 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setSupplierPage((p) => Math.min(supplierPageCount - 1, p + 1));
                      }}
                      disabled={supplierPage >= supplierPageCount - 1}
                    >
                      <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScreenLayout>
      {supplierModal}
      {rowMenuPos?.supplier ? (
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
                const id = rowMenuPos.supplier.id;
                closeRowMenu();
                setSelectedSupplier(id);
              }}
            >
              <Text style={styles.stockRowMenuItemText}>عرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const supplier = rowMenuPos.supplier;
                closeRowMenu();
                openEditSupplier(supplier);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const id = rowMenuPos.supplier.id;
                closeRowMenu();
                removeSupplier(id);
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
