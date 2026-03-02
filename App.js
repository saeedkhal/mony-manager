import { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { I18nManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart } from "react-native-chart-kit";

// Imports
import CustomModal from "./components/Modal";
import Drawer from "./components/Drawer";
import Header from "./components/Header";
import {
  CURRENCY,
  CLIENT_EXPENSE_CATS,
  GENERAL_EXPENSE_CATS,
  PROJECT_TYPES,
  STATUS_LABELS,
  MONTHS_AR,
  NAV_ITEMS,
} from "./constants";
import { getFiscalYear, getCurrentFiscalYear, getFiscalYearLabel, fmt } from "./utils/helpers";
import { initState, saveState } from "./utils/storage";
import { useAppData } from "./hooks/useAppData";

// Force RTL
I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function App() {
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);
  const [workers, setWorkers] = useState([
    { id: 1, name: "عمرو", phone: "" },
    { id: 2, name: "أيمن", phone: "" },
    { id: 3, name: "علي", phone: "" },
  ]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeFY, setActiveFY] = useState(getCurrentFiscalYear());
  const [nissabPrice, setNissabPrice] = useState(85000);
  const [tab, setTab] = useState("dashboard");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [showFYPicker, setShowFYPicker] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const drawerAnimation = useRef(new Animated.Value(SCREEN_WIDTH * 0.75)).current;

  useEffect(() => {
    if (showDrawer) {
      drawerAnimation.setValue(SCREEN_WIDTH * 0.75);
      Animated.timing(drawerAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showDrawer]);

  useEffect(() => {
    const loadData = async () => {
      const saved = await initState();
      if (saved) {
        setClients(saved.clients || []);
        setGeneralTxs(saved.generalTxs || []);
        setWorkers(saved.workers || workers);
        setSuppliers(saved.suppliers || []);
        setActiveFY(saved.activeFY || getCurrentFiscalYear());
        setNissabPrice(saved.nissabPrice || 85000);
      }
      setLoaded(true);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (loaded) {
      saveState({ clients, generalTxs, workers, suppliers, activeFY, nissabPrice });
    }
  }, [clients, generalTxs, workers, suppliers, activeFY, nissabPrice, loaded]);

  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);
  const {
    allFYs,
    fyClients,
    fyGeneralTxs,
    clientTotals,
    totalIncome,
    totalClientExp,
    totalGenExp,
    netProfit,
    monthlyData,
    workerStats,
    supplierStats,
  } = appData;

  const ZAKAT_RATE = 0.025;
  const zakatBase = netProfit > 0 ? netProfit : 0;
  const zakatAmount = zakatBase * ZAKAT_RATE;
  const zakatDue = zakatBase >= nissabPrice;

  const saveClient = () => {
    if (!form.name?.trim()) return;
    setClients((p) => [
      ...p,
      {
        id: Date.now(),
        name: form.name.trim(),
        project: form.project || PROJECT_TYPES[0],
        status: "active",
        note: form.note || "",
        createdAt: new Date().toISOString().split("T")[0],
        txs: [],
      },
    ]);
    setModal(null);
    setForm({});
  };

  const saveClientTx = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const tx = { type: form.txType, amount: Number(form.amount), cat: form.cat, note: form.note || "", date };
    if (form.workerId) tx.workerId = form.workerId;
    if (form.supplierId) tx.supplierId = form.supplierId;

    if (form.editTxId) {
      const targetClientId = form.clientId || selectedClient;
      setClients((p) =>
        p.map((c) =>
          c.id === targetClientId
            ? { ...c, txs: c.txs.map((t) => (t.id === form.editTxId ? { ...tx, id: t.id } : t)) }
            : c
        )
      );
    } else {
      tx.id = Date.now();
      const targetClientId = form.clientId || selectedClient;
      setClients((p) => p.map((c) => (c.id === targetClientId ? { ...c, txs: [...c.txs, tx] } : c)));
    }
    setModal(null);
    setForm({});
  };

  const saveGeneral = () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    setGeneralTxs((p) => [
      ...p,
      {
        id: Date.now(),
        amount: Number(form.amount),
        cat: form.cat || GENERAL_EXPENSE_CATS[0],
        note: form.note || "",
        date,
      },
    ]);
    setModal(null);
    setForm({});
  };

  const saveWorker = () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      setWorkers((p) =>
        p.map((w) => (w.id === form.editId ? { ...w, name: form.name.trim(), phone: form.phone || "" } : w))
      );
    } else {
      setWorkers((p) => [...p, { id: Date.now(), name: form.name.trim(), phone: form.phone || "" }]);
    }
    setModal(null);
    setForm({});
  };

  const saveSupplier = () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      setSuppliers((p) =>
        p.map((s) =>
          s.id === form.editId
            ? { ...s, name: form.name.trim(), phone: form.phone || "", category: form.category || "" }
            : s
        )
      );
    } else {
      setSuppliers((p) => [
        ...p,
        { id: Date.now(), name: form.name.trim(), phone: form.phone || "", category: form.category || "" },
      ]);
    }
    setModal(null);
    setForm({});
  };

  const deleteClientTx = (cid, tid) =>
    setClients((p) => p.map((c) => (c.id === cid ? { ...c, txs: c.txs.filter((t) => t.id !== tid) } : c)));
  const deleteClient = (cid) => {
    setClients((p) => p.filter((c) => c.id !== cid));
    setSelectedClient(null);
    setTab("clients");
  };
  const toggleStatus = (cid) =>
    setClients((p) => p.map((c) => (c.id === cid ? { ...c, status: c.status === "active" ? "done" : "active" } : c)));
  const deleteWorker = (id) => {
    setWorkers((p) => p.filter((w) => w.id !== id));
    if (selectedWorker === id) setSelectedWorker(null);
  };
  const deleteSupplier = (id) => {
    setSuppliers((p) => p.filter((s) => s.id !== id));
    if (selectedSupplier === id) setSelectedSupplier(null);
  };

  const openClientTx = (cid, txType, editTx = null) => {
    setSelectedClient(cid);
    if (editTx) {
      setForm({
        editTxId: editTx.id,
        clientId: cid,
        txType: editTx.type,
        amount: editTx.amount,
        cat: editTx.cat,
        note: editTx.note || "",
        date: editTx.date,
        workerId: editTx.workerId,
        supplierId: editTx.supplierId,
      });
    } else {
      setForm({
        txType,
        cat: txType === "income" ? "مقدم" : CLIENT_EXPENSE_CATS[0],
        date: new Date().toISOString().split("T")[0],
      });
    }
    setModal("addClientTx");
  };

  const activeClient = clients.find((c) => c.id === selectedClient);
  const activeClientFY = activeClient
    ? { ...activeClient, txs: activeClient.txs.filter((t) => getFiscalYear(t.date) === activeFY) }
    : null;
  const activeWorker = workerStats.find((w) => w.id === selectedWorker);
  const activeSupplier = supplierStats.find((s) => s.id === selectedSupplier);
  const chartData = fyClients
    .map((c) => {
      const t = clientTotals(c);
      return { name: c.name, دخل: t.income, مصروف: t.expense, ربح: t.profit };
    })
    .sort((a, b) => b.ربح - a.ربح);

  const navItems = [
    ["dashboard", "📊", "الرئيسية"],
    ["clients", "👥", "العملاء"],
    ["workers", "👷", "الصنايعية"],
    ["suppliers", "🏭", "الموردين"],
    ["general", "🏢", "مصروفات عامة"],
    ["zakat", "🌙", "الزكاة"],
  ];

  const getWorkerName = (id) => workers.find((w) => w.id === id)?.name || "غير محدد";
  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "غير محدد";

  // Chart data preparation
  const monthlyChartData = {
    labels: monthlyData.map((m) => m.label),
    datasets: [
      {
        data: monthlyData.map((m) => m.دخل),
        color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
      },
      {
        data: monthlyData.map((m) => m.مصروف),
        color: (opacity = 1) => `rgba(244, 63, 94, ${opacity})`,
      },
    ],
  };

  const clientChartData = {
    labels: chartData.slice(0, 10).map((c) => c.name.length > 8 ? c.name.substring(0, 8) + "..." : c.name),
    datasets: [
      {
        data: chartData.slice(0, 10).map((c) => c.دخل),
        color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
      },
      {
        data: chartData.slice(0, 10).map((c) => c.مصروف),
        color: (opacity = 1) => `rgba(251, 146, 60, ${opacity})`,
      },
    ],
  };

  const chartConfig = {
    backgroundColor: "#1e1b4b",
    backgroundGradientFrom: "#1e1b4b",
    backgroundGradientTo: "#0f172a",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForBackgroundLines: {
      strokeDasharray: "",
      stroke: "rgba(255, 255, 255, 0.08)",
    },
  };

  const insets = useSafeAreaInsets();

  const headerActions = (
    <>
      {tab === "clients" && !selectedClient && (
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => {
            setForm({});
            setModal("addClient");
          }}
        >
          <Text style={styles.btnText}>+ عميل جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "workers" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnWorker]}
          onPress={() => {
            setForm({});
            setModal("addWorker");
          }}
        >
          <Text style={styles.btnText}>+ صنايعي جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "suppliers" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnSupplier]}
          onPress={() => {
            setForm({});
            setModal("addSupplier");
          }}
        >
          <Text style={styles.btnText}>+ مورد جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "general" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnGeneral]}
          onPress={() => {
            setForm({ cat: GENERAL_EXPENSE_CATS[0], date: new Date().toISOString().split("T")[0] });
            setModal("addGeneral");
          }}
        >
          <Text style={styles.btnText}>+ مصروف عام</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const handleFYChange = (fy) => {
    setActiveFY(fy);
    setShowFYPicker(false);
    setSelectedClient(null);
  };

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Header
        onMenuPress={() => setShowDrawer(true)}
        title="🏪 مول عموله"
        activeFY={activeFY}
        allFYs={allFYs}
        showFYPicker={showFYPicker}
        onToggleFYPicker={() => setShowFYPicker((p) => !p)}
        onFYChange={handleFYChange}
        getCurrentFiscalYear={getCurrentFiscalYear}
        getFiscalYearLabel={getFiscalYearLabel}
        headerActions={headerActions}
      />


      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <View style={styles.dashboard}>
            <View style={styles.statsGrid}>
              {[
                {
                  label: "صافي الربح",
                  val: netProfit,
                  icon: "💰",
                  color: netProfit >= 0 ? "#10b981" : "#f43f5e",
                  bg: "rgba(16,185,129,0.08)",
                },
                { label: "إجمالي الدخل", val: totalIncome, icon: "📈", color: "#818cf8", bg: "rgba(129,140,248,0.08)" },
                {
                  label: "مصروفات العملاء",
                  val: totalClientExp,
                  icon: "🔨",
                  color: "#fb923c",
                  bg: "rgba(251,146,60,0.08)",
                },
                { label: "مصروفات عامة", val: totalGenExp, icon: "🏢", color: "#f43f5e", bg: "rgba(244,63,94,0.08)" },
              ].map((c) => (
                <View key={c.label} style={[styles.statCard, { backgroundColor: c.bg, borderColor: c.color + "30" }]}>
                  <Text style={styles.statIcon}>{c.icon}</Text>
                  <Text style={styles.statLabel}>{c.label}</Text>
                  <Text style={[styles.statValue, { color: c.color }]}>
                    {fmt(c.val)} {CURRENCY}
                  </Text>
                </View>
              ))}
            </View>

            {monthlyData.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📅 الدخل والمصروفات شهرياً — {activeFY}</Text>
                <BarChart
                  data={monthlyChartData}
                  width={SCREEN_WIDTH - 80}
                  height={220}
                  chartConfig={chartConfig}
                  style={styles.chart}
                  yAxisLabel=""
                  yAxisSuffix=""
                  showValuesOnTopOfBars
                />
              </View>
            )}

            {chartData.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🏆 ربحية العملاء — {activeFY}</Text>
                <BarChart
                  data={clientChartData}
                  width={SCREEN_WIDTH - 80}
                  height={200}
                  chartConfig={chartConfig}
                  style={styles.chart}
                  yAxisLabel=""
                  yAxisSuffix=""
                  showValuesOnTopOfBars
                />
              </View>
            )}

            {fyClients.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>👥 ملخص العملاء</Text>
                {[...fyClients]
                  .sort((a, b) => clientTotals(b).profit - clientTotals(a).profit)
                  .map((c) => {
                    const t = clientTotals(c);
                    const s = STATUS_LABELS[c.status];
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.clientSummaryItem}
                        onPress={() => {
                          setSelectedClient(c.id);
                          setTab("clients");
                        }}
                      >
                        <View style={styles.clientSummaryInfo}>
                          <Text style={styles.clientSummaryName}>{c.name}</Text>
                          <Text style={styles.clientSummaryProject}>{c.project}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                        </View>
                        <View style={styles.clientSummaryProfit}>
                          <Text style={[styles.clientSummaryProfitText, { color: t.profit >= 0 ? "#10b981" : "#f43f5e" }]}>
                            {t.profit >= 0 ? "+" : ""}
                            {fmt(t.profit)} {CURRENCY}
                          </Text>
                          <Text style={styles.clientSummaryProfitLabel}>صافي ربح</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}

            {fyClients.length === 0 && totalGenExp === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>لا توجد بيانات في السنة المالية {activeFY}</Text>
              </View>
            )}
          </View>
        )}

        {/* CLIENTS */}
        {tab === "clients" && !selectedClient && (
          <View style={styles.clientsView}>
            {clients.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyText}>لا يوجد عملاء بعد، ابدأ بإضافة عميل!</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionSubtitle}>
                  عرض العملاء الذين لهم معاملات في السنة المالية {activeFY}
                </Text>
                {fyClients.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyText}>لا توجد معاملات في هذه السنة المالية</Text>
                  </View>
                )}
                <View style={styles.clientsGrid}>
                  {fyClients.map((c) => {
                    const t = clientTotals(c);
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
                            <Text style={[styles.clientCardStatValue, { color: t.profit >= 0 ? "#10b981" : "#f43f5e" }]}>
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
        )}

        {/* CLIENT DETAIL - Continue with similar pattern for all other tabs */}
        {/* Due to length, I'll include key sections and you can expand similarly */}
        
        {tab === "clients" && selectedClient && activeClient && activeClientFY && (() => {
          const t = clientTotals(activeClientFY);
          const s = STATUS_LABELS[activeClient.status];
          return (
            <View style={styles.clientDetail}>
              <View style={styles.clientDetailHeader}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setSelectedClient(null)}
                >
                  <Text style={styles.backBtnText}>← رجوع</Text>
                </TouchableOpacity>
                <View style={styles.clientDetailInfo}>
                  <Text style={styles.clientDetailName}>{activeClient.name}</Text>
                  <Text style={styles.clientDetailMeta}>
                    {activeClient.project} — السنة المالية {activeFY}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: s.bg }]}
                  onPress={() => toggleStatus(activeClient.id)}
                >
                  <Text style={[styles.statusBtnText, { color: s.color }]}>{s.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteClient(activeClient.id)}
                >
                  <Text style={styles.deleteBtnText}>حذف العميل</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.clientDetailStats}>
                {[
                  ["💵 إجمالي الدخل", "#818cf8", "rgba(129,140,248,0.1)", t.income],
                  ["🔨 إجمالي المصروفات", "#fb923c", "rgba(251,146,60,0.1)", t.expense],
                  [
                    "💰 صافي الربح",
                    t.profit >= 0 ? "#10b981" : "#f43f5e",
                    t.profit >= 0 ? "rgba(16,185,129,0.1)" : "rgba(244,63,94,0.1)",
                    t.profit,
                  ],
                ].map(([l, col, bg, v]) => (
                  <View key={l} style={[styles.clientDetailStatCard, { backgroundColor: bg, borderColor: col + "30" }]}>
                    <Text style={styles.clientDetailStatLabel}>{l}</Text>
                    <Text style={[styles.clientDetailStatValue, { color: col }]}>
                      {fmt(v)} {CURRENCY}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.clientDetailActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnIncome, { flex: 1 }]}
                  onPress={() => openClientTx(activeClient.id, "income")}
                >
                  <Text style={styles.btnText}>+ دفعة مستلمة 📈</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnExpense, { flex: 1 }]}
                  onPress={() => openClientTx(activeClient.id, "expense")}
                >
                  <Text style={styles.btnText}>+ مصروف على العميل 🔨</Text>
                </TouchableOpacity>
              </View>

              {activeClientFY.txs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
                </View>
              ) : (
                <View style={styles.txList}>
                  {[...activeClientFY.txs].reverse().map((tx) => (
                    <View
                      key={tx.id}
                      style={[
                        styles.txItem,
                        { borderColor: tx.type === "income" ? "rgba(99,102,241,0.3)" : "rgba(251,146,60,0.3)" },
                      ]}
                    >
                      <Text style={styles.txIcon}>{tx.type === "income" ? "💵" : "🔨"}</Text>
                      <View style={styles.txContent}>
                        <View style={styles.txTags}>
                          <View
                            style={[
                              styles.tag,
                              { backgroundColor: tx.type === "income" ? "rgba(99,102,241,0.2)" : "rgba(251,146,60,0.2)" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tagText,
                                { color: tx.type === "income" ? "#818cf8" : "#fb923c" },
                              ]}
                            >
                              {tx.cat}
                            </Text>
                          </View>
                          {tx.workerId && (
                            <View style={[styles.tag, { backgroundColor: "rgba(245,158,11,0.2)" }]}>
                              <Text style={[styles.tagText, { color: "#f59e0b" }]}>
                                👷 {getWorkerName(tx.workerId)}
                              </Text>
                            </View>
                          )}
                          {tx.supplierId && (
                            <View style={[styles.tag, { backgroundColor: "rgba(139,92,246,0.2)" }]}>
                              <Text style={[styles.tagText, { color: "#a78bfa" }]}>
                                🏭 {getSupplierName(tx.supplierId)}
                              </Text>
                            </View>
                          )}
                          {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                        </View>
                        <Text style={styles.txDate}>{tx.date}</Text>
                      </View>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: tx.type === "income" ? "#818cf8" : "#fb923c" },
                        ]}
                      >
                        {tx.type === "income" ? "+" : "-"}
                        {fmt(tx.amount)} {CURRENCY}
                      </Text>
                      <TouchableOpacity
                        style={styles.txEditBtn}
                        onPress={() => openClientTx(activeClient.id, tx.type, tx)}
                      >
                        <Text style={styles.txEditBtnText}>تعديل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.txDeleteBtn}
                        onPress={() => deleteClientTx(activeClient.id, tx.id)}
                      >
                        <Text style={styles.txDeleteBtnText}>حذف</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Similar patterns for WORKERS, SUPPLIERS, GENERAL, ZAKAT tabs */}
        {/* I'll include a simplified version due to length constraints */}
        
        {tab === "workers" && !selectedWorker && (
          <View style={styles.workersView}>
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
                            deleteWorker(w.id);
                          }}
                        >
                          <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.workerCardStats}>
                      <Text style={styles.workerCardStatsLabel}>إجمالي المصروفات ({activeFY})</Text>
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
        )}

        {/* WORKER DETAIL */}
        {tab === "workers" && selectedWorker && activeWorker && (
          <View style={styles.workerDetail}>
            <View style={styles.workerDetailHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedWorker(null)}>
                <Text style={styles.backBtnText}>← رجوع</Text>
              </TouchableOpacity>
              <View style={styles.workerDetailInfo}>
                <Text style={styles.workerDetailName}>👷 {activeWorker.name}</Text>
                <Text style={styles.workerDetailMeta}>السنة المالية {activeFY}</Text>
                {activeWorker.phone && <Text style={styles.workerDetailMeta}>📞 {activeWorker.phone}</Text>}
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setForm({ editId: activeWorker.id, name: activeWorker.name, phone: activeWorker.phone });
                  setModal("addWorker");
                }}
              >
                <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)" }]}>
              <Text style={styles.workerDetailStatsLabel}>إجمالي المصروفات على {activeWorker.name}</Text>
              <Text style={styles.workerDetailStatsValue}>
                {fmt(activeWorker.total)} {CURRENCY}
              </Text>
              <Text style={styles.workerDetailStatsCount}>
                {activeWorker.count} معاملة في {activeFY}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnWorker, { width: "100%", marginBottom: 20 }]}
              onPress={() => {
                setForm({
                  txType: "expense",
                  cat: "مصنعية",
                  workerId: activeWorker.id,
                  date: new Date().toISOString().split("T")[0],
                });
                setModal("addWorkerTx");
              }}
            >
              <Text style={styles.btnText}>+ إضافة مصروف جديد لـ {activeWorker.name}</Text>
            </TouchableOpacity>

            {activeWorker.txs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
              </View>
            ) : (
              <View style={styles.txList}>
                {[...activeWorker.txs].reverse().map((tx) => (
                  <View key={tx.id} style={[styles.txItem, { borderColor: "rgba(251,146,60,0.3)" }]}>
                    <Text style={styles.txIcon}>🔨</Text>
                    <View style={styles.txContent}>
                      <View style={styles.txTags}>
                        <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#818cf8" }]}>👤 {tx.clientName}</Text>
                        </View>
                        <View style={[styles.tag, { backgroundColor: "rgba(251,146,60,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#fb923c" }]}>{tx.cat}</Text>
                        </View>
                        {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                      </View>
                      <Text style={styles.txDate}>{tx.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: "#fb923c" }]}>-{fmt(tx.amount)} {CURRENCY}</Text>
                    <TouchableOpacity
                      style={styles.txEditBtn}
                      onPress={() => {
                        setForm({
                          editTxId: tx.id,
                          clientId: tx.clientId,
                          txType: tx.type,
                          amount: tx.amount,
                          cat: tx.cat,
                          note: tx.note || "",
                          date: tx.date,
                          workerId: tx.workerId,
                          supplierId: tx.supplierId,
                        });
                        setModal("addClientTx");
                      }}
                    >
                      <Text style={styles.txEditBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.txDeleteBtn}
                      onPress={() => deleteClientTx(tx.clientId, tx.id)}
                    >
                      <Text style={styles.txDeleteBtnText}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* SUPPLIERS */}
        {tab === "suppliers" && !selectedSupplier && (
          <View style={styles.suppliersView}>
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
                        {s.category && <Text style={styles.supplierCardCategory}>{s.category}</Text>}
                        {s.phone && <Text style={styles.supplierCardPhone}>📞 {s.phone}</Text>}
                      </View>
                      <View style={styles.supplierCardActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            setForm({ editId: s.id, name: s.name, phone: s.phone, category: s.category });
                            setModal("addSupplier");
                          }}
                        >
                          <Text style={styles.iconBtnText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, styles.iconBtnDanger]}
                          onPress={(e) => {
                            e.stopPropagation();
                            deleteSupplier(s.id);
                          }}
                        >
                          <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.supplierCardStats}>
                      <Text style={styles.supplierCardStatsLabel}>إجمالي المشتريات ({activeFY})</Text>
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
        )}

        {/* SUPPLIER DETAIL */}
        {tab === "suppliers" && selectedSupplier && activeSupplier && (
          <View style={styles.supplierDetail}>
            <View style={styles.supplierDetailHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedSupplier(null)}>
                <Text style={styles.backBtnText}>← رجوع</Text>
              </TouchableOpacity>
              <View style={styles.supplierDetailInfo}>
                <Text style={styles.supplierDetailName}>🏭 {activeSupplier.name}</Text>
                <Text style={styles.supplierDetailMeta}>السنة المالية {activeFY}</Text>
                {activeSupplier.phone && <Text style={styles.supplierDetailMeta}>📞 {activeSupplier.phone}</Text>}
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setForm({
                    editId: activeSupplier.id,
                    name: activeSupplier.name,
                    phone: activeSupplier.phone,
                    category: activeSupplier.category,
                  });
                  setModal("addSupplier");
                }}
              >
                <Text style={styles.editBtnText}>✏️ تعديل البيانات</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)" }]}>
              <Text style={styles.supplierDetailStatsLabel}>إجمالي المشتريات من {activeSupplier.name}</Text>
              <Text style={styles.supplierDetailStatsValue}>
                {fmt(activeSupplier.total)} {CURRENCY}
              </Text>
              <Text style={styles.supplierDetailStatsCount}>
                {activeSupplier.count} معاملة في {activeFY}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnSupplier, { width: "100%", marginBottom: 20 }]}
              onPress={() => {
                setForm({
                  txType: "expense",
                  cat: activeSupplier.category || "قماش",
                  supplierId: activeSupplier.id,
                  date: new Date().toISOString().split("T")[0],
                });
                setModal("addSupplierTx");
              }}
            >
              <Text style={styles.btnText}>+ إضافة مشتريات من {activeSupplier.name}</Text>
            </TouchableOpacity>

            {activeSupplier.txs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>لا توجد معاملات في {activeFY}</Text>
              </View>
            ) : (
              <View style={styles.txList}>
                {[...activeSupplier.txs].reverse().map((tx) => (
                  <View key={tx.id} style={[styles.txItem, { borderColor: "rgba(251,146,60,0.3)" }]}>
                    <Text style={styles.txIcon}>🔨</Text>
                    <View style={styles.txContent}>
                      <View style={styles.txTags}>
                        <View style={[styles.tag, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#818cf8" }]}>👤 {tx.clientName}</Text>
                        </View>
                        <View style={[styles.tag, { backgroundColor: "rgba(251,146,60,0.2)" }]}>
                          <Text style={[styles.tagText, { color: "#fb923c" }]}>{tx.cat}</Text>
                        </View>
                        {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                      </View>
                      <Text style={styles.txDate}>{tx.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: "#fb923c" }]}>-{fmt(tx.amount)} {CURRENCY}</Text>
                    <TouchableOpacity
                      style={styles.txEditBtn}
                      onPress={() => {
                        setForm({
                          editTxId: tx.id,
                          clientId: tx.clientId,
                          txType: tx.type,
                          amount: tx.amount,
                          cat: tx.cat,
                          note: tx.note || "",
                          date: tx.date,
                          workerId: tx.workerId,
                          supplierId: tx.supplierId,
                        });
                        setModal("addClientTx");
                      }}
                    >
                      <Text style={styles.txEditBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.txDeleteBtn}
                      onPress={() => deleteClientTx(tx.clientId, tx.id)}
                    >
                      <Text style={styles.txDeleteBtnText}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* GENERAL EXPENSES */}
        {tab === "general" && (
          <View style={styles.generalView}>
            <View style={styles.generalStatsGrid}>
              {GENERAL_EXPENSE_CATS.map((cat) => {
                const total = fyGeneralTxs.filter((t) => t.cat === cat).reduce((s, t) => s + t.amount, 0);
                return total > 0 ? (
                  <View
                    key={cat}
                    style={[
                      styles.card,
                      {
                        backgroundColor: "rgba(244,63,94,0.07)",
                        borderColor: "rgba(244,63,94,0.2)",
                        alignItems: "center",
                        minWidth: 150,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text style={styles.generalStatLabel}>{cat}</Text>
                    <Text style={styles.generalStatValue}>{fmt(total)}</Text>
                    <Text style={styles.generalStatCurrency}>{CURRENCY}</Text>
                  </View>
                ) : null;
              })}
            </View>
            {fyGeneralTxs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏢</Text>
                <Text style={styles.emptyText}>لا توجد مصروفات عامة في السنة المالية {activeFY}</Text>
              </View>
            ) : (
              <View style={styles.txList}>
                {[...fyGeneralTxs].reverse().map((t) => (
                  <View key={t.id} style={[styles.txItem, { borderColor: "rgba(244,63,94,0.2)" }]}>
                    <Text style={styles.txIcon}>🏢</Text>
                    <View style={styles.txContent}>
                      <View style={styles.txTags}>
                        <View style={[styles.tag, { backgroundColor: "rgba(244,63,94,0.15)" }]}>
                          <Text style={[styles.tagText, { color: "#f43f5e" }]}>{t.cat}</Text>
                        </View>
                        {t.note && <Text style={styles.txNote}>{t.note}</Text>}
                      </View>
                      <Text style={styles.txDate}>{t.date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: "#f43f5e" }]}>-{fmt(t.amount)} {CURRENCY}</Text>
                    <TouchableOpacity
                      style={styles.txDeleteBtn}
                      onPress={() => setGeneralTxs((p) => p.filter((x) => x.id !== t.id))}
                    >
                      <Text style={styles.txDeleteBtnText}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ZAKAT */}
        {tab === "zakat" && (
          <View style={styles.zakatView}>
            <View style={styles.zakatHeader}>
              <Text style={styles.zakatIcon}>🌙</Text>
              <Text style={styles.zakatTitle}>حساب زكاة المال</Text>
              <Text style={styles.zakatSubtitle}>السنة المالية {activeFY} — نسبة الزكاة 2.5%</Text>
            </View>

            <View style={[styles.card, { backgroundColor: "rgba(129,140,248,0.07)", borderColor: "rgba(129,140,248,0.25)" }]}>
              <View style={styles.zakatNissabRow}>
                <View>
                  <Text style={styles.zakatNissabLabel}>💎 قيمة النصاب (85 جرام ذهب)</Text>
                  <Text style={styles.zakatNissabSubtext}>حدّث القيمة حسب سعر الذهب الحالي</Text>
                </View>
                <View style={styles.zakatNissabInput}>
                  <TextInput
                    style={[styles.input, { width: 130, textAlign: "center", fontSize: 14 }]}
                    value={nissabPrice.toString()}
                    onChangeText={(text) => setNissabPrice(Number(text) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.zakatNissabCurrency}>{CURRENCY}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 تفاصيل الحساب</Text>
              <View style={styles.zakatDetails}>
                {[
                  ["📈 إجمالي الدخل", fmt(totalIncome), "#818cf8"],
                  ["🔨 مصروفات العملاء", `- ${fmt(totalClientExp)}`, "#fb923c"],
                  ["🏢 مصروفات عامة", `- ${fmt(totalGenExp)}`, "#f43f5e"],
                ].map(([l, v, c]) => (
                  <View key={l} style={styles.zakatDetailRow}>
                    <Text style={styles.zakatDetailLabel}>{l}</Text>
                    <Text style={[styles.zakatDetailValue, { color: c }]}>
                      {v} {CURRENCY}
                    </Text>
                  </View>
                ))}
                <View style={[styles.zakatDetailRow, styles.zakatDetailRowTotal]}>
                  <Text style={styles.zakatDetailLabelTotal}>💰 صافي الربح (وعاء الزكاة)</Text>
                  <Text style={[styles.zakatDetailValueTotal, { color: netProfit >= 0 ? "#10b981" : "#f43f5e" }]}>
                    {fmt(zakatBase)} {CURRENCY}
                  </Text>
                </View>
                <View style={styles.zakatDetailRow}>
                  <Text style={styles.zakatDetailLabel}>📐 النصاب المطلوب</Text>
                  <Text style={[styles.zakatDetailValue, { color: "#818cf8" }]}>
                    {fmt(nissabPrice)} {CURRENCY}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: zakatDue ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.1)",
                  borderColor: zakatDue ? "rgba(16,185,129,0.35)" : "rgba(100,116,139,0.25)",
                  alignItems: "center",
                  padding: 28,
                },
              ]}
            >
              {zakatDue ? (
                <>
                  <Text style={styles.zakatResultIcon}>✅</Text>
                  <Text style={styles.zakatResultText}>بلغ الربح النصاب — تجب الزكاة</Text>
                  <Text style={styles.zakatResultAmount}>{fmt(zakatAmount)}</Text>
                  <Text style={styles.zakatResultCurrency}>{CURRENCY}</Text>
                  <Text style={styles.zakatResultFormula}>
                    {fmt(zakatBase)} × 2.5% = {fmt(zakatAmount)} {CURRENCY}
                  </Text>
                  <View style={styles.zakatResultMessage}>
                    <Text style={styles.zakatResultMessageText}>🌙 تقبّل الله منك وبارك في رزقك</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.zakatResultIcon}>ℹ️</Text>
                  <Text style={styles.zakatResultText}>لم يبلغ الربح النصاب بعد</Text>
                  <Text style={styles.zakatResultSubtext}>
                    يحتاج الربح أن يبلغ{" "}
                    <Text style={styles.zakatResultSubtextHighlight}>
                      {fmt(nissabPrice)} {CURRENCY}
                    </Text>{" "}
                    لتجب الزكاة
                  </Text>
                  {netProfit > 0 && (
                    <Text style={styles.zakatResultSubtext}>
                      المتبقي للنصاب:{" "}
                      <Text style={[styles.zakatResultSubtextHighlight, { color: "#f59e0b" }]}>
                        {fmt(nissabPrice - zakatBase)} {CURRENCY}
                      </Text>
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.2)" }]}>
              <Text style={styles.zakatWarningTitle}>⚠️ تنبيه</Text>
              <Text style={styles.zakatWarningText}>
                هذا الحساب تقديري بناءً على بيانات المعرض. يُنصح بمراجعة أهل العلم لضبط وعاء الزكاة بدقة حسب ظروفك.
              </Text>
            </View>
          </View>
        )}

        {/* MODALS */}
        <CustomModal visible={modal === "addClient"} onClose={() => setModal(null)}>
          <Text style={styles.modalTitle}>👤 إضافة عميل جديد</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>اسم العميل</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: أحمد محمد"
              placeholderTextColor="#64748b"
              value={form.name || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.input}
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
                  style={[
                    styles.optionBtn,
                    form.project === pt && styles.optionBtnActive,
                  ]}
                  onPress={() => setForm((p) => ({ ...p, project: pt }))}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      form.project === pt && styles.optionBtnTextActive,
                    ]}
                  >
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

        <CustomModal visible={modal === "addClientTx"} onClose={() => setModal(null)}>
          <Text style={styles.modalTitle}>
            {form.editTxId ? "✏️ تعديل معاملة" : form.txType === "income" ? "💵 دفعة مستلمة" : "🔨 مصروف على العميل"}
          </Text>
          <Text style={styles.modalSubtitle}>
            العميل: {activeClient?.name} — {activeFY}
          </Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748b"
              value={form.amount?.toString() || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الفئة</Text>
            <View style={styles.optionsGrid}>
              {(form.txType === "income" ? ["مقدم", "دفعة", "رصيد نهائي", "أخرى"] : CLIENT_EXPENSE_CATS).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.optionBtn,
                    form.cat === cat && styles.optionBtnActive,
                    form.txType === "income" && form.cat === cat && { backgroundColor: "#6366f1" },
                    form.txType === "expense" && form.cat === cat && { backgroundColor: "#f43f5e" },
                  ]}
                  onPress={() => setForm((p) => ({ ...p, cat, workerId: undefined, supplierId: undefined }))}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      form.cat === cat && styles.optionBtnTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {form.txType === "expense" && form.cat === "مصنعية" && workers.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>👷 الصنايعي</Text>
              <View style={styles.optionsGrid}>
                {workers.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.optionBtn,
                      form.workerId === w.id && { backgroundColor: "rgba(245,158,11,0.3)", borderColor: "#f59e0b" },
                    ]}
                    onPress={() => setForm((p) => ({ ...p, workerId: w.id }))}
                  >
                    <Text
                      style={[
                        styles.optionBtnText,
                        form.workerId === w.id && { color: "#f59e0b", fontWeight: "700" },
                      ]}
                    >
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {form.txType === "expense" && (form.cat === "قماش" || form.cat === "خشب وكلف") && suppliers.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>🏭 المورد</Text>
              <View style={styles.optionsGrid}>
                {suppliers.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.optionBtn,
                      form.supplierId === s.id && { backgroundColor: "rgba(139,92,246,0.3)", borderColor: "#a78bfa" },
                    ]}
                    onPress={() => setForm((p) => ({ ...p, supplierId: s.id }))}
                  >
                    <Text
                      style={[
                        styles.optionBtnText,
                        form.supplierId === s.id && { color: "#a78bfa", fontWeight: "700" },
                      ]}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor="#64748b"
              value={form.note || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>التاريخ</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={form.date || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.btn,
              form.txType === "income" ? styles.btnIncome : styles.btnExpense,
              styles.modalSaveBtn,
            ]}
            onPress={saveClientTx}
          >
            <Text style={styles.btnText}>{form.editTxId ? "حفظ التعديلات ✓" : "حفظ ✓"}</Text>
          </TouchableOpacity>
        </CustomModal>

        <CustomModal visible={modal === "addGeneral"} onClose={() => setModal(null)}>
          <Text style={styles.modalTitle}>🏢 مصروف عام — {activeFY}</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748b"
              value={form.amount?.toString() || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الفئة</Text>
            <View style={styles.optionsGrid}>
              {GENERAL_EXPENSE_CATS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.optionBtn,
                    form.cat === cat && [styles.optionBtnActive, { backgroundColor: "#f43f5e" }],
                  ]}
                  onPress={() => setForm((p) => ({ ...p, cat }))}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      form.cat === cat && styles.optionBtnTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor="#64748b"
              value={form.note || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>التاريخ</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={form.date || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
            />
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnGeneral, styles.modalSaveBtn]} onPress={saveGeneral}>
            <Text style={styles.btnText}>حفظ ✓</Text>
          </TouchableOpacity>
        </CustomModal>

        <CustomModal visible={modal === "addWorker"} onClose={() => setModal(null)}>
          <Text style={styles.modalTitle}>👷 {form.editId ? "تعديل" : "إضافة"} صنايعي</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الاسم</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: عمرو"
              placeholderTextColor="#64748b"
              value={form.name || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, name: text }))}
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
          <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveWorker}>
            <Text style={styles.btnText}>حفظ ✓</Text>
          </TouchableOpacity>
        </CustomModal>

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

        <CustomModal
          visible={modal === "addWorkerTx"}
          onClose={() => {
            setModal(null);
            setShowClientPicker(false);
          }}
        >
          <Text style={styles.modalTitle}>🔨 إضافة مصروف لـ {workers.find((w) => w.id === form.workerId)?.name}</Text>
          <Text style={styles.modalSubtitle}>اختر العميل وأدخل تفاصيل المصروف</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👤 العميل</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowClientPicker((p) => !p)}
              >
                <Text style={[styles.pickerBtnText, form.clientId && { color: "#818cf8" }]}>
                  {form.clientId
                    ? clients.find((c) => c.id === form.clientId)?.name || "-- اختر العميل --"
                    : "-- اختر العميل --"}
                </Text>
                <Text style={styles.pickerBtnArrow}>▾</Text>
              </TouchableOpacity>
              {showClientPicker && (
                <View style={styles.pickerDropdown}>
                  <ScrollView style={styles.pickerList}>
                    <TouchableOpacity
                      style={[styles.pickerItem, !form.clientId && styles.pickerItemActive]}
                      onPress={() => {
                        setForm((p) => ({ ...p, clientId: null }));
                        setShowClientPicker(false);
                      }}
                    >
                      <Text style={[styles.pickerItemText, !form.clientId && styles.pickerItemTextActive]}>
                        -- اختر العميل --
                      </Text>
                    </TouchableOpacity>
                    {clients.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.pickerItem, form.clientId === c.id && styles.pickerItemActive]}
                        onPress={() => {
                          setForm((p) => ({ ...p, clientId: c.id }));
                          setShowClientPicker(false);
                        }}
                      >
                        <Text style={[styles.pickerItemText, form.clientId === c.id && styles.pickerItemTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748b"
              value={form.amount?.toString() || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor="#64748b"
              value={form.note || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>التاريخ</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={form.date || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
            />
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnWorker, styles.modalSaveBtn]} onPress={saveClientTx}>
            <Text style={styles.btnText}>حفظ ✓</Text>
          </TouchableOpacity>
        </CustomModal>

        <CustomModal
          visible={modal === "addSupplierTx"}
          onClose={() => {
            setModal(null);
            setShowClientPicker(false);
          }}
        >
          <Text style={styles.modalTitle}>🔨 إضافة مشتريات من {suppliers.find((s) => s.id === form.supplierId)?.name}</Text>
          <Text style={styles.modalSubtitle}>اختر العميل وأدخل تفاصيل المشتريات</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👤 العميل</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowClientPicker((p) => !p)}
              >
                <Text style={[styles.pickerBtnText, form.clientId && { color: "#818cf8" }]}>
                  {form.clientId
                    ? clients.find((c) => c.id === form.clientId)?.name || "-- اختر العميل --"
                    : "-- اختر العميل --"}
                </Text>
                <Text style={styles.pickerBtnArrow}>▾</Text>
              </TouchableOpacity>
              {showClientPicker && (
                <View style={styles.pickerDropdown}>
                  <ScrollView style={styles.pickerList}>
                    <TouchableOpacity
                      style={[styles.pickerItem, !form.clientId && styles.pickerItemActive]}
                      onPress={() => {
                        setForm((p) => ({ ...p, clientId: null }));
                        setShowClientPicker(false);
                      }}
                    >
                      <Text style={[styles.pickerItemText, !form.clientId && styles.pickerItemTextActive]}>
                        -- اختر العميل --
                      </Text>
                    </TouchableOpacity>
                    {clients.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.pickerItem, form.clientId === c.id && styles.pickerItemActive]}
                        onPress={() => {
                          setForm((p) => ({ ...p, clientId: c.id }));
                          setShowClientPicker(false);
                        }}
                      >
                        <Text style={[styles.pickerItemText, form.clientId === c.id && styles.pickerItemTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>المبلغ ({CURRENCY})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748b"
              value={form.amount?.toString() || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, amount: text }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الفئة</Text>
            <View style={styles.optionsGrid}>
              {["قماش", "خشب وكلف", "أخرى"].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.optionBtn,
                    form.cat === cat && [styles.optionBtnActive, { backgroundColor: "#8b5cf6" }],
                  ]}
                  onPress={() => setForm((p) => ({ ...p, cat }))}
                >
                  <Text
                    style={[
                      styles.optionBtnText,
                      form.cat === cat && styles.optionBtnTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor="#64748b"
              value={form.note || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, note: text }))}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>التاريخ</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={form.date || ""}
              onChangeText={(text) => setForm((p) => ({ ...p, date: text }))}
            />
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnSupplier, styles.modalSaveBtn]} onPress={saveClientTx}>
            <Text style={styles.btnText}>حفظ ✓</Text>
          </TouchableOpacity>
        </CustomModal>
      </ScrollView>

      <Drawer
        visible={showDrawer}
        onClose={() => {
          Animated.timing(drawerAnimation, {
            toValue: SCREEN_WIDTH * 0.75,
            duration: 300,
            useNativeDriver: true,
          }).start(() => setShowDrawer(false));
        }}
        navItems={navItems}
        activeTab={tab}
        onTabChange={(k) => {
          setTab(k);
          setSelectedClient(null);
        }}
        drawerAnimation={drawerAnimation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loadingText: {
    color: "#f1f5f9",
    fontSize: 16,
    textAlign: "center",
  },
  header: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.09)",
    padding: 14,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  menuButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  menuIcon: {
    fontSize: 24,
    color: "#818cf8",
    fontWeight: "bold",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#818cf8",
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  btn: {
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  btnPrimary: {
    backgroundColor: "#6366f1",
  },
  btnWorker: {
    backgroundColor: "#f59e0b",
  },
  btnSupplier: {
    backgroundColor: "#8b5cf6",
  },
  btnGeneral: {
    backgroundColor: "#f43f5e",
  },
  btnIncome: {
    backgroundColor: "#6366f1",
  },
  btnExpense: {
    backgroundColor: "#f43f5e",
  },
  fySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
  },
  fyLabel: {
    color: "#64748b",
    fontSize: 13,
  },
  fyLabelSub: {
    color: "#475569",
    fontSize: 12,
  },
  fyPickerContainer: {
    position: "relative",
  },
  fyPickerBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  fyPickerText: {
    color: "#818cf8",
    fontSize: 13,
  },
  fyPickerDropdown: {
    position: "absolute",
    top: "110%",
    right: 0,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 8,
    zIndex: 100,
    minWidth: 200,
    maxHeight: 300,
  },
  fyPickerList: {
    maxHeight: 250,
  },
  fyPickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 2,
  },
  fyPickerItemActive: {
    backgroundColor: "rgba(129,140,248,0.2)",
  },
  fyPickerItemText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  fyPickerItemTextActive: {
    color: "#818cf8",
  },
  fyPickerItemSubtext: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "400",
  },
  fyResetBtn: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    borderRadius: 11,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  fyResetText: {
    color: "#10b981",
    fontSize: 11,
  },
  nav: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  navItem: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 6,
  },
  navItemActive: {
    backgroundColor: "#6366f1",
  },
  navText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "400",
  },
  navTextActive: {
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  dashboard: {
    gap: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  statCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    minWidth: 150,
    flex: 1,
  },
  statIcon: {
    fontSize: 26,
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    color: "#c4b5fd",
    fontSize: 15,
    marginBottom: 16,
    fontWeight: "700",
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  clientSummaryItem: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  clientSummaryInfo: {
    flex: 1,
  },
  clientSummaryName: {
    fontWeight: "700",
    fontSize: 15,
    color: "#f1f5f9",
  },
  clientSummaryProject: {
    color: "#64748b",
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  clientSummaryProfit: {
    alignItems: "flex-end",
    minWidth: 110,
  },
  clientSummaryProfitText: {
    fontWeight: "800",
    fontSize: 15,
  },
  clientSummaryProfitLabel: {
    color: "#64748b",
    fontSize: 11,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyText: {
    color: "#475569",
    marginTop: 10,
  },
  clientsView: {
    gap: 16,
  },
  sectionSubtitle: {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 16,
  },
  clientsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  clientCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 14,
    minWidth: 280,
    flex: 1,
  },
  clientCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  clientCardName: {
    fontWeight: "800",
    fontSize: 16,
    color: "#f1f5f9",
  },
  clientCardMeta: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  clientCardStats: {
    flexDirection: "row",
    gap: 6,
  },
  clientCardStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
  },
  clientCardStatLabel: {
    color: "#64748b",
    fontSize: 11,
  },
  clientCardStatValue: {
    fontWeight: "700",
    fontSize: 13,
    marginTop: 4,
  },
  clientDetail: {
    gap: 20,
  },
  clientDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  backBtnText: {
    color: "#94a3b8",
    fontSize: 14,
  },
  clientDetailInfo: {
    flex: 1,
  },
  clientDetailName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  clientDetailMeta: {
    color: "#64748b",
    fontSize: 13,
  },
  statusBtn: {
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  statusBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  deleteBtn: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.3)",
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  deleteBtnText: {
    color: "#f43f5e",
    fontSize: 14,
  },
  clientDetailStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  clientDetailStatCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  clientDetailStatLabel: {
    color: "#94a3b8",
    fontSize: 12,
  },
  clientDetailStatValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  clientDetailActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  txList: {
    gap: 10,
  },
  txItem: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  txIcon: {
    fontSize: 22,
  },
  txContent: {
    flex: 1,
  },
  txTags: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  tag: {
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  txNote: {
    color: "#94a3b8",
    fontSize: 13,
  },
  txDate: {
    color: "#475569",
    fontSize: 12,
    marginTop: 4,
  },
  txAmount: {
    fontWeight: "800",
    fontSize: 16,
    minWidth: 100,
    textAlign: "left",
  },
  txEditBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.3)",
    borderRadius: 11,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  txEditBtnText: {
    color: "#818cf8",
    fontSize: 12,
  },
  txDeleteBtn: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.25)",
    borderRadius: 11,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  txDeleteBtnText: {
    color: "#f43f5e",
    fontSize: 12,
  },
  workersView: {
    gap: 16,
  },
  workersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  workerCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 14,
    minWidth: 280,
    flex: 1,
  },
  workerCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  workerCardName: {
    fontWeight: "800",
    fontSize: 16,
    color: "#f1f5f9",
  },
  workerCardPhone: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  workerCardActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.3)",
    borderRadius: 11,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  iconBtnDanger: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderColor: "rgba(244,63,94,0.25)",
  },
  iconBtnText: {
    fontSize: 12,
  },
  workerCardStats: {
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  workerCardStatsLabel: {
    color: "#94a3b8",
    fontSize: 11,
  },
  workerCardStatsValue: {
    color: "#f59e0b",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  workerCardStatsCount: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
  },
  modalCancelBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
  },
  modalTitle: {
    color: "#c4b5fd",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: "#f1f5f9",
    fontSize: 15,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  optionBtnActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
  },
  optionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "400",
  },
  optionBtnTextActive: {
    fontWeight: "700",
  },
  modalSaveBtn: {
    width: "100%",
    paddingVertical: 12,
    marginBottom: 8,
  },
  modalSubtitle: {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 18,
  },
  workerDetail: {
    gap: 20,
  },
  workerDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  workerDetailInfo: {
    flex: 1,
  },
  workerDetailName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  workerDetailMeta: {
    color: "#64748b",
    fontSize: 13,
    marginRight: 12,
  },
  editBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.3)",
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  editBtnText: {
    color: "#818cf8",
    fontSize: 14,
  },
  workerDetailStatsLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  workerDetailStatsValue: {
    color: "#f59e0b",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
  },
  workerDetailStatsCount: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },
  suppliersView: {
    gap: 16,
  },
  suppliersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  supplierCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    padding: 14,
    minWidth: 280,
    flex: 1,
  },
  supplierCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  supplierCardName: {
    fontWeight: "800",
    fontSize: 16,
    color: "#f1f5f9",
  },
  supplierCardCategory: {
    color: "#a78bfa",
    fontSize: 12,
    marginTop: 2,
  },
  supplierCardPhone: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  supplierCardActions: {
    flexDirection: "row",
    gap: 6,
  },
  supplierCardStats: {
    backgroundColor: "rgba(139,92,246,0.1)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  supplierCardStatsLabel: {
    color: "#94a3b8",
    fontSize: 11,
  },
  supplierCardStatsValue: {
    color: "#a78bfa",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  supplierCardStatsCount: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
  },
  supplierDetail: {
    gap: 20,
  },
  supplierDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  supplierDetailInfo: {
    flex: 1,
  },
  supplierDetailName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  supplierDetailMeta: {
    color: "#64748b",
    fontSize: 13,
    marginRight: 12,
  },
  supplierDetailStatsLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  supplierDetailStatsValue: {
    color: "#a78bfa",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
  },
  supplierDetailStatsCount: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },
  generalView: {
    gap: 20,
  },
  generalStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  generalStatLabel: {
    color: "#94a3b8",
    fontSize: 12,
  },
  generalStatValue: {
    color: "#f43f5e",
    fontWeight: "800",
    fontSize: 18,
    marginTop: 6,
  },
  generalStatCurrency: {
    color: "#64748b",
    fontSize: 11,
  },
  zakatView: {
    gap: 20,
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
  },
  zakatHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  zakatIcon: {
    fontSize: 52,
  },
  zakatTitle: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 22,
    fontWeight: "800",
    color: "#c4b5fd",
  },
  zakatSubtitle: {
    color: "#64748b",
    fontSize: 13,
  },
  zakatNissabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  zakatNissabLabel: {
    fontWeight: "700",
    fontSize: 14,
    color: "#c4b5fd",
  },
  zakatNissabSubtext: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  zakatNissabInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  zakatNissabCurrency: {
    color: "#94a3b8",
    fontSize: 13,
  },
  zakatDetails: {
    gap: 10,
  },
  zakatDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
  },
  zakatDetailRowTotal: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  zakatDetailLabel: {
    color: "#94a3b8",
    fontSize: 14,
  },
  zakatDetailLabelTotal: {
    color: "#f1f5f9",
    fontWeight: "700",
    fontSize: 14,
  },
  zakatDetailValue: {
    fontWeight: "700",
    fontSize: 14,
  },
  zakatDetailValueTotal: {
    fontWeight: "800",
    fontSize: 15,
  },
  zakatResultIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  zakatResultText: {
    color: "#94a3b8",
    fontSize: 14,
    marginBottom: 8,
  },
  zakatResultAmount: {
    color: "#10b981",
    fontSize: 36,
    fontWeight: "900",
  },
  zakatResultCurrency: {
    color: "#10b981",
    fontSize: 16,
    marginTop: 4,
  },
  zakatResultFormula: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 12,
  },
  zakatResultMessage: {
    marginTop: 16,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  zakatResultMessageText: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "700",
  },
  zakatResultSubtext: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 8,
  },
  zakatResultSubtextHighlight: {
    color: "#818cf8",
    fontWeight: "700",
  },
  zakatWarningTitle: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  zakatWarningText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 20,
  },
  pickerContainer: {
    position: "relative",
  },
  pickerBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  pickerBtnText: {
    color: "#94a3b8",
    fontSize: 14,
  },
  pickerBtnArrow: {
    color: "#818cf8",
  },
  pickerDropdown: {
    position: "absolute",
    top: "110%",
    right: 0,
    left: 0,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 8,
    zIndex: 100,
    maxHeight: 200,
  },
  pickerList: {
    maxHeight: 180,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 2,
  },
  pickerItemActive: {
    backgroundColor: "rgba(129,140,248,0.2)",
  },
  pickerItemText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  pickerItemTextActive: {
    color: "#818cf8",
  },
  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 9999,
    elevation: 9999,
  },
  drawerContent: {
    position: "absolute",
    top: 0,
    right: 0,
    width: SCREEN_WIDTH * 0.75,
    maxWidth: 320,
    height: "100%",
    backgroundColor: "#1e1b4b",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 10000,
    elevation: 10000,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#818cf8",
  },
  drawerClose: {
    fontSize: 24,
    color: "#94a3b8",
    fontWeight: "300",
  },
  drawerList: {
    flex: 1,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  drawerItemActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
    borderRightWidth: 3,
    borderRightColor: "#6366f1",
  },
  drawerItemIcon: {
    fontSize: 24,
    marginLeft: 12,
    width: 30,
  },
  drawerItemText: {
    fontSize: 16,
    color: "#94a3b8",
    fontWeight: "400",
    flex: 1,
  },
  drawerItemTextActive: {
    color: "#818cf8",
    fontWeight: "700",
  },
});
