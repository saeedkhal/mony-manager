import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler, Alert } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getWorkersPage,
  getWorkerExpenseStatsMap,
  deleteWorker as dbDeleteWorker,
  upsertWorker,
  getWorkers,
  DELETE_BLOCKED,
} from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import WorkerDetail from "./WorkerDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

const WORKERS_PAGE_SIZE = 5;

export default function Workers() {
  const { loaded, modal, setForm, setModal, form, activeFiscalYearId } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [workers, setWorkers] = useState([]);
  const [workerTotal, setWorkerTotal] = useState(0);
  const [workerPage, setWorkerPage] = useState(0);
  const [expenseStatsMap, setExpenseStatsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
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
  const workerPageCount = Math.max(1, Math.ceil((workerTotal || 0) / WORKERS_PAGE_SIZE));

  useEffect(() => {
    setWorkerPage(0);
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

  const openRowMenu = (worker) => {
    if (!worker) return;
    if (Number(rowMenuId) === Number(worker.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[worker.id];
    const root = listRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(worker.id);
      setRowMenuPos({ x, y, w, h, worker });
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

  const refreshWorkers = async (page, gen) => {
    const offset = page * WORKERS_PAGE_SIZE;
    const [{ workers: rows, total }, stats] = await Promise.all([
      getWorkersPage(WORKERS_PAGE_SIZE, offset, pageOptions),
      getWorkerExpenseStatsMap(activeFiscalYearId),
    ]);
    if (gen != null && gen !== listFetchGen.current) return;
    const n = Number(total) || 0;
    const maxPage = Math.max(0, Math.ceil(n / WORKERS_PAGE_SIZE) - 1);
    if (page > maxPage) {
      setWorkerPage(maxPage);
      setWorkerTotal(n);
      return;
    }
    setWorkers(rows || []);
    setWorkerTotal(n);
    setExpenseStatsMap(stats && typeof stats === "object" ? stats : {});
  };

  useEffect(() => {
    if (!loaded || selectedWorker != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    closeRowMenu();
    refreshWorkers(workerPage, gen)
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setWorkers([]);
        setWorkerTotal(0);
        setExpenseStatsMap({});
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedWorker, pageOptions, workerPage, activeFiscalYearId]);

  const workerStats = useMemo(() => {
    return (workers || []).map((w) => {
      const st = expenseStatsMap[String(w.id)] || { total: 0, count: 0, balance: 0 };
      return { ...w, total: st.total, count: st.count, balance: Number(st.balance) || 0 };
    });
  }, [workers, expenseStatsMap]);

  const openEditWorker = (w) => {
    setFormErrors({});
    setForm({ editId: w.id, name: w.name, phone: w.phone || "" });
    setModal("addWorker");
  };

  const removeWorker = async (id) => {
    try {
      await dbDeleteWorker(id);
      if (String(selectedWorker) === String(id)) setSelectedWorker(null);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      await refreshWorkers(workerPage, gen);
    } catch (e) {
      if (e?.code === DELETE_BLOCKED) {
        Alert.alert("لا يمكن الحذف", e.message);
      }
    }
  };

  const saveWorker = async () => {
    if (!trimmed(form.name)) {
      setFormErrors({ name: FORM_MSG.required });
      return;
    }
    setFormErrors({});
    try {
      if (form.editId) {
        const list = await getWorkers();
        const w = list.find((x) => x.id === form.editId);
        if (!w) return;
        await upsertWorker({ ...w, name: form.name.trim(), phone: form.phone || "" });
      } else {
        await upsertWorker({
          id: Date.now(),
          name: form.name.trim(),
          phone: form.phone || "",
        });
      }
      const nextPage = form.editId ? workerPage : 0;
      if (!form.editId) setWorkerPage(0);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      await refreshWorkers(nextPage, gen);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const workerModal = (
    <CustomModal
      visible={modal === "addWorker"}
      onClose={() => {
        setFormErrors({});
        setModal(null);
      }}
      centered
    >
      <Text style={styles.modalTitle}>👷 {form.editId ? "تعديل" : "إضافة"} صنايعي</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>الاسم</Text>
        <FormTextInput
          styles={styles}
          placeholder="مثال: عمرو"
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
      <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveWorker}>
        <Text style={styles.btnText}>حفظ ✓</Text>
      </TouchableOpacity>
    </CustomModal>
  );

  if (selectedWorker) {
    return (
      <View style={{ flex: 1 }}>
        <WorkerDetail selectedWorker={selectedWorker} setSelectedWorker={setSelectedWorker} />
        {workerModal}
      </View>
    );
  }

  if (loading && workers.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.workersView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {workerModal}
      </View>
    );
  }

  return (
    <View ref={listRootRef} collapsable={false} style={{ flex: 1 }}>
      <ScreenLayout>
        <View style={styles.workersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnWorker, { marginBottom: 12, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              closeRowMenu();
              setModal("addWorker");
            }}
          >
            <Text style={styles.btnText}>+ صنايعي جديد</Text>
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
                style={[styles.btn, styles.btnWorker, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => {
                  closeRowMenu();
                  setAppliedSearch(trimmed(searchQuery));
                }}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {loading && workers.length > 0 ? (
            <View style={{ paddingVertical: 8, alignItems: "center" }}>
              <ActivityIndicator color="#f59e0b" />
            </View>
          ) : null}
          {workers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={styles.emptyText}>
                {appliedSearch
                  ? "لا يوجد صنايعية يطابقون البحث. جرّب كلمات أخرى أو احذف النص واضغط بحث."
                  : "لا يوجد صنايعية بعد"}
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
                      الباقي
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      {" "}
                    </Text>
                  </View>
                </View>
                {workerStats.map((w, index) => {
                  const isLast = index === workerStats.length - 1;
                  return (
                    <View
                      key={w.id}
                      style={[
                        styles.stockTableRow,
                        index % 2 === 1 && styles.stockTableRowAlt,
                        isLast && workerPageCount <= 1 && styles.stockTableRowLast,
                      ]}
                    >
                      <View style={[styles.stockTableCol, styles.stockTableColName]}>
                        <Text style={styles.stockTableCellName} numberOfLines={2}>
                          {w.name}
                        </Text>
                        <Text style={styles.stockTableCellSub} numberOfLines={1}>
                          {w.count} معاملة
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                        <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                          {w.phone || "—"}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                        <Text
                          style={[
                            styles.stockTableCell,
                            styles.stockTableCellCenter,
                            {
                              color:
                                w.balance > 0 ? "#f59e0b" : w.balance < 0 ? "#f43f5e" : "#10b981",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {w.balance > 0 ? "له " : w.balance < 0 ? "عليه " : ""}
                          {fmt(Math.abs(w.balance))} {CURRENCY}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                        <View
                          collapsable={false}
                          ref={(el) => {
                            if (el) menuBtnRefs.current[w.id] = el;
                            else delete menuBtnRefs.current[w.id];
                          }}
                        >
                          <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(w)}>
                            <Text style={styles.stockMenuBtnText}>⋮</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {workerPageCount > 1 ? (
                  <View style={styles.stockTablePager}>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        workerPage === 0 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setWorkerPage((p) => Math.max(0, p - 1));
                      }}
                      disabled={workerPage === 0}
                    >
                      <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                    </TouchableOpacity>
                    <Text style={styles.stockTablePagerInfo}>
                      صفحة {workerPage + 1} من {workerPageCount}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        workerPage >= workerPageCount - 1 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setWorkerPage((p) => Math.min(workerPageCount - 1, p + 1));
                      }}
                      disabled={workerPage >= workerPageCount - 1}
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
      {workerModal}
      {rowMenuPos?.worker ? (
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
                const id = rowMenuPos.worker.id;
                closeRowMenu();
                setSelectedWorker(id);
              }}
            >
              <Text style={styles.stockRowMenuItemText}>عرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const worker = rowMenuPos.worker;
                closeRowMenu();
                openEditWorker(worker);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const id = rowMenuPos.worker.id;
                closeRowMenu();
                removeWorker(id);
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
