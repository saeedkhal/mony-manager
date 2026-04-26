import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getClients, getActiveFiscalYear, getActiveFiscalYearId, upsertClient } from "../utils/db";
import { STATUS_LABELS, PROJECT_TYPES } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ClientDetail from "./ClientDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

export default function Clients() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    if (!loaded || activeFiscalYearId == null) return;
    let cancelled = false;
    setLoading(true);
    getClients()
      .then((list) => { if (!cancelled) setClients(list || []); })
      .catch(() => { if (!cancelled) setClients([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded, activeFiscalYearId, modal]);

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
      const list = await getClients();
      setClients(list || []);
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
      <ScreenLayout>
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
          {clients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>لا يوجد عملاء بعد، ابدأ بإضافة عميل!</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionSubtitle}>
                جميع العملاء — السنة المالية {activeFiscalYearLabel}
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
            </>
          )}
        </View>
      </ScreenLayout>
      {addClientModal}
    </>
  );
}
