import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler } from "react-native";
import { useRoute, useNavigation, useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { getClientsPage, getActiveFiscalYear, getActiveFiscalYearId, upsertClient, getClientWithTxs } from "../utils/db";
import { STATUS_LABELS, PROJECT_TYPES } from "../constants";
import { fmt } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ClientDetail from "./ClientDetail";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";
import { FORM_MSG, trimmed, parsePositiveAmount } from "../utils/formValidation";

const CLIENTS_PAGE_SIZE = 5;

export default function Clients() {
  const route = useRoute();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const [formErrors, setFormErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [clientTotal, setClientTotal] = useState(0);
  const [clientPage, setClientPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  /** Applied filter only after user taps «بحث» (not while typing). */
  const [appliedSearch, setAppliedSearch] = useState("");
  const [clientTick, setClientTick] = useState(0);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const listFetchGen = useRef(0);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);
  const pageOptions = useMemo(
    () => (appliedSearch ? { nameContains: appliedSearch } : {}),
    [appliedSearch]
  );
  const clientPageCount = Math.max(1, Math.ceil((clientTotal || 0) / CLIENTS_PAGE_SIZE));

  useEffect(() => {
    setClientPage(0);
  }, [appliedSearch, activeFiscalYearId]);

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

  const openRowMenu = (client) => {
    if (!client) return;
    if (Number(rowMenuId) === Number(client.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[client.id];
    const root = listRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(client.id);
      setRowMenuPos({ x, y, w, h, client });
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

  /** Open a specific client (e.g. from Dashboard «ملخص العملاء»). */
  useEffect(() => {
    const raw = route.params?.openClientId;
    if (raw == null || raw === "") return;
    const id = typeof raw === "number" && !Number.isNaN(raw) ? raw : Number(raw);
    if (Number.isNaN(id)) return;
    setSelectedClient(id);
    navigation.setParams({ openClientId: undefined });
  }, [route.params?.openClientId, navigation]);

  useEffect(() => {
    if (!loaded || !isFocused) return;
    if (selectedClient != null) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    closeRowMenu();
    const offset = clientPage * CLIENTS_PAGE_SIZE;
    getClientsPage(CLIENTS_PAGE_SIZE, offset, pageOptions)
      .then(({ clients: rows, total }) => {
        if (cancelled || gen !== listFetchGen.current) return;
        const n = Number(total) || 0;
        const maxPage = Math.max(0, Math.ceil(n / CLIENTS_PAGE_SIZE) - 1);
        if (clientPage > maxPage) {
          setClientPage(maxPage);
          setClientTotal(n);
          return;
        }
        setClients(rows || []);
        setClientTotal(n);
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setClients([]);
        setClientTotal(0);
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, activeFiscalYearId, selectedClient, pageOptions, clientPage]);

  const saveClient = async () => {
    if (!trimmed(form.name)) {
      setFormErrors({ name: FORM_MSG.required });
      return;
    }
    const orderRaw = trimmed(form.orderAmount);
    let orderAmount = null;
    if (orderRaw) {
      orderAmount = parsePositiveAmount(orderRaw);
      if (orderAmount == null) {
        setFormErrors({ orderAmount: FORM_MSG.amount });
        return;
      }
    }
    setFormErrors({});
    try {
      if (form.editId) {
        const existing = await getClientWithTxs(form.editId);
        if (!existing) return;
        await upsertClient({
          ...existing,
          name: form.name.trim(),
          project: form.project || existing.project || PROJECT_TYPES[0],
          note: form.note || "",
          phone: trimmed(form.phone),
          orderAmount,
        });
      } else {
        await getActiveFiscalYear();
        const fiscalYearId = await getActiveFiscalYearId();
        await upsertClient({
          id: Date.now(),
          name: form.name.trim(),
          project: form.project || PROJECT_TYPES[0],
          status: "active",
          note: form.note || "",
          phone: trimmed(form.phone),
          orderAmount,
          fiscalYearId: fiscalYearId ?? null,
          createdAt: new Date().toISOString().split("T")[0],
          txs: [],
        });
      }
      const nextPage = form.editId ? clientPage : 0;
      if (!form.editId) setClientPage(0);
      listFetchGen.current += 1;
      const gen = listFetchGen.current;
      const { clients: rows, total } = await getClientsPage(
        CLIENTS_PAGE_SIZE,
        nextPage * CLIENTS_PAGE_SIZE,
        pageOptions
      );
      if (gen === listFetchGen.current) {
        setClients(rows || []);
        setClientTotal(Number(total) || 0);
      }
      setClientTick((n) => n + 1);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const clientsWithYearTxs = clients || [];

  const totalsForYear = (c) => {
    const txs = c.txs || [];
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const orderAmount = Number(c.orderAmount) > 0 ? Number(c.orderAmount) : 0;
    const remaining = orderAmount > 0 ? orderAmount - income : null;
    return { income, expense, profit: income - expense, orderAmount, remaining };
  };

  const openEditClient = (c) => {
    setFormErrors({});
    setForm({
      editId: c.id,
      name: c.name || "",
      note: c.note || "",
      project: c.project || PROJECT_TYPES[0],
      phone: c.phone || "",
      orderAmount: Number(c.orderAmount) > 0 ? String(c.orderAmount) : "",
    });
    setModal("addClient");
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
      <Text style={styles.modalTitle}>{form.editId ? "✏️ تعديل بيانات العميل" : "👤 إضافة عميل جديد"}</Text>
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
        <Text style={styles.inputLabel}>رقم التليفون</Text>
        <FormTextInput
          styles={styles}
          placeholder="01xxxxxxxxx"
          placeholderTextColor="#64748b"
          value={form.phone || ""}
          onChangeText={(text) => setForm((p) => ({ ...p, phone: text }))}
          keyboardType="phone-pad"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>قيمة الطلبية</Text>
        <FormTextInput
          styles={styles}
          placeholder="0"
          placeholderTextColor="#64748b"
          value={form.orderAmount?.toString() || ""}
          onChangeText={(text) => {
            setFormErrors((e) => ({ ...e, orderAmount: undefined }));
            setForm((p) => ({ ...p, orderAmount: text }));
          }}
          keyboardType="numeric"
          error={formErrors.orderAmount}
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
        <Text style={styles.btnText}>{form.editId ? "حفظ التعديلات ✓" : "حفظ العميل ✓"}</Text>
      </TouchableOpacity>
    </CustomModal>
  );

  if (selectedClient) {
    return (
      <View style={{ flex: 1 }}>
        <ClientDetail
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          onClientDeleted={() => setSelectedClient(null)}
          onEditClient={openEditClient}
          reloadToken={clientTick}
        />
        {addClientModal}
      </View>
    );
  }

  if (loading && clients.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.clientsView}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        {addClientModal}
      </View>
    );
  }

  return (
    <View ref={listRootRef} collapsable={false} style={{ flex: 1 }}>
      <ScreenLayout>
        <View style={styles.clientsView}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { marginBottom: 16, alignSelf: "flex-start" }]}
            onPress={() => {
              setFormErrors({});
              setForm({});
              closeRowMenu();
              setModal("addClient");
            }}
          >
            <Text style={styles.btnText}>+ عميل جديد</Text>
          </TouchableOpacity>
          <View style={[styles.inputGroup, { marginBottom: 8 }]}>
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
                style={[styles.btn, styles.btnPrimary, { paddingVertical: 11, paddingHorizontal: 18 }]}
                onPress={() => {
                  closeRowMenu();
                  setAppliedSearch(trimmed(searchQuery));
                }}
              >
                <Text style={styles.btnText}>بحث</Text>
              </TouchableOpacity>
            </View>
          </View>
          {loading && clients.length > 0 ? (
            <View style={{ paddingVertical: 8, alignItems: "center" }}>
              <ActivityIndicator color="#818cf8" />
            </View>
          ) : null}
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
              <View style={styles.stockTableCard}>
                <View style={styles.stockTableHeader}>
                  <View style={[styles.stockTableCol, styles.stockTableColName]}>
                    <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                      الاسم
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColCost]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      الطلبية
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      المدفوع
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      المتبقي
                    </Text>
                  </View>
                  <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                    <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                      {" "}
                    </Text>
                  </View>
                </View>
                {clientsWithYearTxs.map((c, index) => {
                  const t = totalsForYear(c);
                  const s = STATUS_LABELS[c.status] || STATUS_LABELS.active;
                  const isLast = index === clientsWithYearTxs.length - 1;
                  const remainingColor =
                    t.remaining == null
                      ? "#94a3b8"
                      : t.remaining > 0
                        ? "#fb923c"
                        : t.remaining < 0
                          ? "#818cf8"
                          : "#10b981";
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.stockTableRow,
                        index % 2 === 1 && styles.stockTableRowAlt,
                        isLast && clientPageCount <= 1 && styles.stockTableRowLast,
                      ]}
                    >
                      <View style={[styles.stockTableCol, styles.stockTableColName]}>
                        <Text style={styles.stockTableCellName} numberOfLines={2}>
                          {c.name}
                        </Text>
                        <Text style={styles.stockTableCellSub} numberOfLines={1}>
                          {c.phone ? `📞 ${c.phone}` : ""}
                          {c.phone && (c.project || s.label) ? " • " : ""}
                          {c.project ? `${c.project} • ` : ""}
                          {s.label}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColCost]}>
                        <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                          {t.orderAmount > 0 ? fmt(t.orderAmount) : "—"}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                        <Text
                          style={[styles.stockTableCell, styles.stockTableCellCenter, { color: "#818cf8" }]}
                          numberOfLines={1}
                        >
                          {fmt(t.income)}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
                        <Text
                          style={[styles.stockTableCell, styles.stockTableCellCenter, { color: remainingColor }]}
                          numberOfLines={1}
                        >
                          {t.remaining == null ? "—" : fmt(t.remaining)}
                        </Text>
                      </View>
                      <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                        <View
                          collapsable={false}
                          ref={(el) => {
                            if (el) menuBtnRefs.current[c.id] = el;
                            else delete menuBtnRefs.current[c.id];
                          }}
                        >
                          <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(c)}>
                            <Text style={styles.stockMenuBtnText}>⋮</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {clientPageCount > 1 ? (
                  <View style={styles.stockTablePager}>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        clientPage === 0 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setClientPage((p) => Math.max(0, p - 1));
                      }}
                      disabled={clientPage === 0}
                    >
                      <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                    </TouchableOpacity>
                    <Text style={styles.stockTablePagerInfo}>
                      صفحة {clientPage + 1} من {clientPageCount}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.stockTablePagerBtn,
                        clientPage >= clientPageCount - 1 && styles.stockTablePagerBtnDisabled,
                      ]}
                      onPress={() => {
                        closeRowMenu();
                        setClientPage((p) => Math.min(clientPageCount - 1, p + 1));
                      }}
                      disabled={clientPage >= clientPageCount - 1}
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
      {addClientModal}
      {rowMenuPos?.client ? (
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
                const id = rowMenuPos.client.id;
                closeRowMenu();
                setSelectedClient(id);
              }}
            >
              <Text style={styles.stockRowMenuItemText}>عرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const client = rowMenuPos.client;
                closeRowMenu();
                openEditClient(client);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const id = rowMenuPos.client.id;
                closeRowMenu();
                navigation.navigate("clientStatement", { clientId: id });
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#34d399" }]}>كشف حساب</Text>
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
