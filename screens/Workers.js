import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getWorkers, getClients, deleteWorker as dbDeleteWorker, upsertWorker } from "../utils/db";
import { CURRENCY } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import WorkerDetail from "./WorkerDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed } from "../utils/formValidation";

export default function Workers() {
  const { loaded, modal, setForm, setModal, form } = useApp();
  const [formErrors, setFormErrors] = useState({});

  const [workers, setWorkers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);

  const deleteWorker = async (id) => {
    try {
      await dbDeleteWorker(id);
    } catch (_) {}
  };

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getWorkers(), getClients()])
      .then(([w, c]) => {
        if (!cancelled) {
          setWorkers(w || []);
          setClients(c || []);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkers([]);
        if (!cancelled) setClients([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loaded, modal]);

  const workerStats = useMemo(() => {
    return (workers || [])
      .map((w) => {
        const matchingTxs = (clients || []).flatMap((c) =>
          (c.txs || [])
            .filter((t) => t.type === "expense" && t.workerId === w.id)
            .map((t) => ({ ...t, clientId: c.id, clientName: c.name }))
        );
        const total = matchingTxs.reduce((s, t) => s + t.amount, 0);
        const count = matchingTxs.length;
        return { ...w, total, count, txs: matchingTxs };
      })
      .sort((a, b) => b.total - a.total);
  }, [workers, clients]);

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
      const [w, c] = await Promise.all([getWorkers(), getClients()]);
      setWorkers(w || []);
      setClients(c || []);
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

  if (loading) {
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
      <ScreenLayout>
        <View style={styles.workersView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnWorker, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              setModal("addWorker");
            }}
          >
            <Text style={styles.btnText}>+ صنايعي جديد</Text>
          </TouchableOpacity>
          {workers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👷</Text>
              <Text style={styles.emptyText}>لا يوجد صنايعية بعد</Text>
            </View>
          ) : (
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
                        onPress={async (e) => {
                          e.stopPropagation();
                          await deleteWorker(w.id);
                          if (selectedWorker === w.id) setSelectedWorker(null);
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
          )}
        </View>
      </ScreenLayout>
      {workerModal}
    </>
  );
}
