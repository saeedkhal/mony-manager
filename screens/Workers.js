import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useApp } from "../context/AppContext";
import {
  getWorkersPage,
  getWorkerExpenseStatsMap,
  deleteWorker as dbDeleteWorker,
  upsertWorker,
  getWorkers,
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
  const { loaded, modal, setForm, setModal, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const [workers, setWorkers] = useState([]);
  const [expenseStatsMap, setExpenseStatsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const listFetchGen = useRef(0);
  const workersRef = useRef([]);

  const pageOptions = useMemo(
    () => (appliedSearch ? { nameContains: appliedSearch } : {}),
    [appliedSearch]
  );

  useEffect(() => {
    workersRef.current = workers;
  }, [workers]);

  useEffect(() => {
    if (!loaded || selectedWorker != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    setWorkers([]);
    setHasMore(true);
    setExpenseStatsMap({});
    Promise.all([
      getWorkersPage(WORKERS_PAGE_SIZE, 0, pageOptions),
      getWorkerExpenseStatsMap(),
    ])
      .then(([{ workers: first, hasMore: hm }, stats]) => {
        if (cancelled || gen !== listFetchGen.current) return;
        setWorkers(first || []);
        setHasMore(!!hm);
        setExpenseStatsMap(stats && typeof stats === "object" ? stats : {});
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setWorkers([]);
        setHasMore(false);
        setExpenseStatsMap({});
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, selectedWorker, pageOptions]);

  const loadMoreWorkers = useCallback(async () => {
    if (!hasMore || loadingMore || loading || selectedWorker != null) return;
    const gen = listFetchGen.current;
    const offset = workersRef.current.length;
    setLoadingMore(true);
    try {
      const { workers: next, hasMore: hm } = await getWorkersPage(
        WORKERS_PAGE_SIZE,
        offset,
        pageOptions
      );
      if (gen !== listFetchGen.current) return;
      setWorkers((prev) => [...prev, ...(next || [])]);
      setHasMore(!!hm);
    } catch (_) {
      if (gen === listFetchGen.current) setHasMore(false);
    } finally {
      if (gen === listFetchGen.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, selectedWorker, pageOptions]);

  const onScrollWorkers = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreWorkers();
      }
    },
    [loadMoreWorkers]
  );

  const workerStats = useMemo(() => {
    return (workers || []).map((w) => {
      const st = expenseStatsMap[String(w.id)] || { total: 0, count: 0 };
      return { ...w, total: st.total, count: st.count, txs: [] };
    });
  }, [workers, expenseStatsMap]);

  const removeWorker = async (id) => {
    try {
      await dbDeleteWorker(id);
      if (String(selectedWorker) === String(id)) setSelectedWorker(null);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const [{ workers: first, hasMore: hm }, stats] = await Promise.all([
        getWorkersPage(WORKERS_PAGE_SIZE, 0, pageOptions),
        getWorkerExpenseStatsMap(),
      ]);
      if (gen === listFetchGen.current) {
        setWorkers(first || []);
        setHasMore(!!hm);
        setExpenseStatsMap(stats && typeof stats === "object" ? stats : {});
      }
    } catch (_) {}
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
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const [{ workers: first, hasMore: hm }, stats] = await Promise.all([
        getWorkersPage(WORKERS_PAGE_SIZE, 0, pageOptions),
        getWorkerExpenseStatsMap(),
      ]);
      if (gen === listFetchGen.current) {
        setWorkers(first || []);
        setHasMore(!!hm);
        setExpenseStatsMap(stats && typeof stats === "object" ? stats : {});
      }
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
      <>
        <WorkerDetail selectedWorker={selectedWorker} setSelectedWorker={setSelectedWorker} />
        {workerModal}
      </>
    );
  }

  if (loading && workers.length === 0) {
    return (
      <>
        <View style={styles.workersView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {workerModal}
      </>
    );
  }

  return (
    <>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollWorkers, scrollEventThrottle: 400 }}>
        <View style={styles.workersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnWorker, { marginBottom: 12, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              setModal("addWorker");
            }}
          >
            <Text style={styles.btnText}>+ صنايعي جديد</Text>
          </TouchableOpacity>
          <View style={[styles.inputGroup, { marginBottom: 12 }]}>
            <Text style={styles.inputLabel}>بحث باسم الصنايعي</Text>
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
                style={[styles.btn, styles.btnWorker, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => setAppliedSearch(trimmed(searchQuery))}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {workers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={styles.emptyText}>
                {appliedSearch
                  ? "لا يوجد صنايعية يطابقون البحث. جرّب اسمًا آخر أو امسح النص واضغط بحث."
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
              <View style={styles.workersGrid}>
                {workerStats.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.workerCard}
                    onPress={() => setSelectedWorker(w.id)}
                  >
                    <View style={styles.workerCardHeader}>
                      <View>
                        <Text style={styles.workerCardName}>👷 {w.name}</Text>
                        {w.phone && <Text style={styles.workerCardPhone}>📞 {w.phone}</Text>}
                      </View>
                      <View style={styles.workerCardActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            setFormErrors({});
                            setForm({ editId: w.id, name: w.name, phone: w.phone });
                            setModal("addWorker");
                          }}
                        >
                          <Text style={styles.iconBtnText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnDanger]}
                          onPress={(e) => {
                            e.stopPropagation();
                            removeWorker(w.id);
                          }}
                        >
                          <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.workerCardStats}>
                      <Text style={styles.workerCardStatsLabel}>إجمالي المصروفات</Text>
                      <Text style={styles.workerCardStatsValue}>
                        {fmt(w.total)} {CURRENCY}
                      </Text>
                      <Text style={styles.workerCardStatsCount}>{w.count} معاملة</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              {loadingMore ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator color="#f59e0b" />
                  <Text style={[styles.loadingText, { marginTop: 8, fontSize: 13 }]}>جاري التحميل...</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScreenLayout>
      {workerModal}
    </>
  );
}
