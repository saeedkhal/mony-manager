import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useApp } from "../context/AppContext";
import { getClientsPage, getActiveFiscalYear, getActiveFiscalYearId, upsertClient } from "../utils/db";
import { STATUS_LABELS, PROJECT_TYPES } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ClientDetail from "./ClientDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

const CLIENTS_PAGE_SIZE = 5;

export default function Clients() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  /** Applied filter only after user taps «بحث» (not while typing). */
  const [appliedSearch, setAppliedSearch] = useState("");
  const listFetchGen = useRef(0);
  const clientsRef = useRef([]);
  const pageOptions = useMemo(
    () => (appliedSearch ? { nameContains: appliedSearch } : {}),
    [appliedSearch]
  );

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    if (!loaded || activeFiscalYearId == null) return;
    if (selectedClient != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    setClients([]);
    setHasMore(true);
    getClientsPage(CLIENTS_PAGE_SIZE, 0, pageOptions)
      .then(({ clients: first, hasMore: hm }) => {
        if (cancelled || gen !== listFetchGen.current) return;
        setClients(first || []);
        setHasMore(!!hm);
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setClients([]);
        setHasMore(false);
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, activeFiscalYearId, selectedClient, pageOptions]);

  const loadMoreClients = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    const gen = listFetchGen.current;
    const offset = clientsRef.current.length;
    setLoadingMore(true);
    try {
      const { clients: next, hasMore: hm } = await getClientsPage(CLIENTS_PAGE_SIZE, offset, pageOptions);
      if (gen !== listFetchGen.current) return;
      setClients((prev) => [...prev, ...(next || [])]);
      setHasMore(!!hm);
    } catch (_) {
      if (gen === listFetchGen.current) setHasMore(false);
    } finally {
      if (gen === listFetchGen.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, pageOptions]);

  const onScrollClients = useCallback(
    (e) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreClients();
      }
    },
    [loadMoreClients]
  );

  const saveClient = async () => {
    if (!trimmed(form.name)) {
      setFormErrors({ name: FORM_MSG.required });
      return;
    }
    setFormErrors({});
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
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const { clients: first, hasMore: hm } = await getClientsPage(CLIENTS_PAGE_SIZE, 0, pageOptions);
      if (gen === listFetchGen.current) {
        setClients(first || []);
        setHasMore(!!hm);
      }
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const clientsWithYearTxs = clients || [];

  const totalsForYear = (c) => {
    const txs = c.txs || [];
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income, expense, profit: income - expense };
  };

  const addClientModal = (
    <CustomModal
      visible={modal === "addClient"}
      onClose={() => {
        setFormErrors({});
        setModal(null);
      }}
      centered
    >
      <Text style={styles.modalTitle}>👤 إضافة عميل جديد</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>اسم العميل</Text>
        <FormTextInput
          styles={styles}
          placeholder="مثال: أحمد محمد"
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
        <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
        <FormTextInput
          styles={styles}
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
  );

  if (selectedClient) {
    return (
      <>
        <ClientDetail
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          onClientDeleted={() => setSelectedClient(null)}
        />
        {addClientModal}
      </>
    );
  }

  if (loading) {
    return (
      <>
        <View style={styles.clientsView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {addClientModal}
      </>
    );
  }

  return (
    <>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollClients, scrollEventThrottle: 400 }}>
        <View style={styles.clientsView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              setModal("addClient");
            }}
          >
            <Text style={styles.btnText}>+ عميل جديد</Text>
          </TouchableOpacity>
          <View style={[styles.inputGroup, { marginBottom: 8 }]}>
            <Text style={styles.inputLabel}>بحث باسم العميل</Text>
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
                style={[styles.btn, styles.btnPrimary, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => setAppliedSearch(trimmed(searchQuery))}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {clients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>
                {appliedSearch
                  ? "لا توجد عملاء يطابقون البحث. جرّب كلمات أخرى أو احذف النص واضغط بحث."
                  : "لا يوجد عملاء بعد، ابدأ بإضافة عميل!"}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionSubtitle}>
                {appliedSearch
                  ? `نتائج البحث عن «${appliedSearch}» — السنة المالية ${activeFiscalYearLabel}`
                  : `جميع العملاء — السنة المالية ${activeFiscalYearLabel}`}
              </Text>
              <View style={styles.clientsGrid}>
                {clientsWithYearTxs.map((c) => {
                  const t = totalsForYear(c);
                  const s = STATUS_LABELS[c.status];
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.clientCard}
                      onPress={() => setSelectedClient(c.id)}
                    >
                      <View style={styles.clientCardHeader}>
                        <View>
                          <Text style={styles.clientCardName}>{c.name}</Text>
                          <Text style={styles.clientCardMeta}>
                            {c.project} • {c.createdAt}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                        </View>
                      </View>
                      <View style={styles.clientCardStats}>
                        <View style={styles.clientCardStat}>
                          <Text style={styles.clientCardStatLabel}>دخل</Text>
                          <Text style={[styles.clientCardStatValue, { color: "#818cf8" }]}>{fmt(t.income)}</Text>
                        </View>
                        <View style={styles.clientCardStat}>
                          <Text style={styles.clientCardStatLabel}>مصروف</Text>
                          <Text style={[styles.clientCardStatValue, { color: "#fb923c" }]}>{fmt(t.expense)}</Text>
                        </View>
                        <View style={styles.clientCardStat}>
                          <Text style={styles.clientCardStatLabel}>ربح</Text>
                          <Text
                            style={[
                              styles.clientCardStatValue,
                              { color: t.profit >= 0 ? "#10b981" : "#f43f5e" },
                            ]}
                          >
                            {fmt(t.profit)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {loadingMore ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator color="#818cf8" />
                  <Text style={[styles.loadingText, { marginTop: 8, fontSize: 13 }]}>جاري التحميل...</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScreenLayout>
      {addClientModal}
    </>
  );
}
