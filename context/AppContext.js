import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Animated, Dimensions, Platform } from "react-native";
import { initState } from "../utils/storage";
import {
  getClientWithTxs,
  getWorkers,
  getSuppliers,
  getSettings,
  upsertClient,
  deleteClient as dbDeleteClient,
  deleteClientTx as dbDeleteClientTx,
  upsertGeneralTx,
  deleteGeneralTx as dbDeleteGeneralTx,
  upsertWorker,
  deleteWorker as dbDeleteWorker,
  upsertSupplier,
  deleteSupplier as dbDeleteSupplier,
  setSettings as dbSetSettings,
} from "../utils/db";
import { getCurrentFiscalYear } from "../utils/helpers";
import { PROJECT_TYPES, CLIENT_EXPENSE_CATS, GENERAL_EXPENSE_CATS } from "../constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AppContext = createContext();

export function AppProvider({ children }) {
  const [generalTxsVersion, setGeneralTxsVersion] = useState(0);
  const [workersVersion, setWorkersVersion] = useState(0);
  const [suppliersVersion, setSuppliersVersion] = useState(0);
  const [activeFY, setActiveFY] = useState(getCurrentFiscalYear());
  const [customFYs, setCustomFYs] = useState([]);
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
  const [dataLoadingCount, setDataLoadingCount] = useState(0);
  const drawerAnimation = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;

  const addDataLoading = () => setDataLoadingCount((c) => c + 1);
  const removeDataLoading = () => setDataLoadingCount((c) => Math.max(0, c - 1));

  useEffect(() => {
    const loadData = async () => {
      await initState();
      const s = await getSettings();
      if (s) {
        setActiveFY(s.activeFY || getCurrentFiscalYear());
        setCustomFYs(s.customFYs || []);
        setNissabPrice(s.nissabPrice ?? 85000);
      }
      setLoaded(true);
    };
    loadData();
  }, []);

  const bumpGeneralTxs = () => setGeneralTxsVersion((v) => v + 1);
  const bumpWorkers = () => setWorkersVersion((v) => v + 1);
  const bumpSuppliers = () => setSuppliersVersion((v) => v + 1);

  useEffect(() => {
    if (showDrawer) {
      drawerAnimation.setValue(-SCREEN_WIDTH * 0.75);
      Animated.timing(drawerAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showDrawer]);

  const closeDrawer = () => {
    Animated.timing(drawerAnimation, {
      toValue: -SCREEN_WIDTH * 0.75,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowDrawer(false));
  };

  const saveClient = async () => {
    if (!form.name?.trim()) return;
    const newClient = {
      id: Date.now(),
      name: form.name.trim(),
      project: form.project || PROJECT_TYPES[0],
      status: "active",
      note: form.note || "",
      createdAt: new Date().toISOString().split("T")[0],
      txs: [],
    };
    try {
      await upsertClient(newClient);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveClientTx = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const targetClientId = form.clientId || selectedClient;
    const client = await getClientWithTxs(targetClientId);
    if (!client) return;
    const tx = { type: form.txType, amount: Number(form.amount), cat: form.cat, note: form.note || "", date };
    if (form.workerId) tx.workerId = form.workerId;
    if (form.supplierId) tx.supplierId = form.supplierId;
    let updatedClient;
    if (form.editTxId) {
      tx.id = form.editTxId;
      updatedClient = {
        ...client,
        txs: (client.txs || []).map((t) => (t.id === form.editTxId ? tx : t)),
      };
    } else {
      tx.id = Date.now();
      updatedClient = { ...client, txs: [...(client.txs || []), tx] };
    }
    try {
      await upsertClient(updatedClient);
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveGeneral = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const tx = {
      id: form.editTxId || Date.now(),
      amount: Number(form.amount),
      cat: form.cat || GENERAL_EXPENSE_CATS[0],
      note: form.note || "",
      date,
    };
    try {
      await upsertGeneralTx(tx);
      bumpGeneralTxs();
    } catch (_) {}
    setModal(null);
    setForm({});
  };

  const saveWorker = async () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      const list = await getWorkers();
      const w = list.find((x) => x.id === form.editId);
      if (!w) return;
      const updated = { ...w, name: form.name.trim(), phone: form.phone || "" };
      try {
        await upsertWorker(updated);
        bumpWorkers();
      } catch (_) {}
    } else {
      const newWorker = { id: Date.now(), name: form.name.trim(), phone: form.phone || "" };
      try {
        await upsertWorker(newWorker);
        bumpWorkers();
      } catch (_) {}
    }
    setModal(null);
    setForm({});
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
        bumpSuppliers();
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
        bumpSuppliers();
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const deleteClientTx = async (cid, tid) => {
    try {
      await dbDeleteClientTx(cid, tid);
    } catch (_) {}
  };

  const deleteGeneralTx = async (id) => {
    try {
      await dbDeleteGeneralTx(id);
      bumpGeneralTxs();
    } catch (_) {}
  };

  const deleteClient = async (cid) => {
    try {
      await dbDeleteClient(cid);
    } catch (_) {}
    setSelectedClient(null);
    setTab("clients");
  };

  const toggleStatus = async (cid) => {
    const client = await getClientWithTxs(cid);
    if (!client) return;
    const updated = { ...client, status: client.status === "active" ? "done" : "active" };
    try {
      await upsertClient(updated);
    } catch (_) {}
  };

  const deleteWorker = async (id) => {
    try {
      await dbDeleteWorker(id);
      bumpWorkers();
    } catch (_) {}
    if (selectedWorker === id) setSelectedWorker(null);
  };

  const deleteSupplier = async (id) => {
    try {
      await dbDeleteSupplier(id);
      bumpSuppliers();
    } catch (_) {}
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

  const handleFYChange = async (fy) => {
    setActiveFY(fy);
    setShowFYPicker(false);
    setSelectedClient(null);
    try {
      await dbSetSettings({ activeFY: fy, customFYs, nissabPrice });
    } catch (_) {}
  };

  const persistSettings = async (partial) => {
    const next = {
      activeFY: partial.activeFY !== undefined ? partial.activeFY : activeFY,
      customFYs: partial.customFYs !== undefined ? partial.customFYs : customFYs,
      nissabPrice: partial.nissabPrice !== undefined ? partial.nissabPrice : nissabPrice,
    };
    setActiveFY(next.activeFY);
    setCustomFYs(next.customFYs);
    setNissabPrice(next.nissabPrice);
    try {
      await dbSetSettings(next);
    } catch (_) {}
  };

  const value = {
    generalTxsVersion,
    workersVersion,
    suppliersVersion,
    activeFY,
    setActiveFY,
    customFYs,
    setCustomFYs,
    nissabPrice,
    setNissabPrice,
    tab,
    setTab,
    selectedClient,
    setSelectedClient,
    selectedWorker,
    setSelectedWorker,
    selectedSupplier,
    setSelectedSupplier,
    modal,
    setModal,
    form,
    setForm,
    showFYPicker,
    setShowFYPicker,
    showClientPicker,
    setShowClientPicker,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
    loaded,
    dataLoadingCount,
    addDataLoading,
    removeDataLoading,
    saveClient,
    saveClientTx,
    saveGeneral,
    saveWorker,
    saveSupplier,
    deleteClientTx,
    deleteClient,
    deleteGeneralTx,
    toggleStatus,
    deleteWorker,
    deleteSupplier,
    openClientTx,
    handleFYChange,
    persistSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
