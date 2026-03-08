import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Animated, Dimensions, Platform } from "react-native";
import { initState, saveState as storageSaveState } from "../utils/storage";
import {
  getFullState,
  upsertClient,
  deleteClient as dbDeleteClient,
  upsertClientTx,
  deleteClientTx as dbDeleteClientTx,
  upsertGeneralTx,
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
const IS_WEB = Platform.OS === "web";

export function AppProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);
  const [workers, setWorkers] = useState([
    { id: 1, name: "عمرو", phone: "" },
    { id: 2, name: "أيمن", phone: "" },
    { id: 3, name: "علي", phone: "" },
  ]);
  const [suppliers, setSuppliers] = useState([]);
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
  const drawerAnimation = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;

  useEffect(() => {
    const loadData = async () => {
      const saved = await initState();
      if (saved) {
        setClients(saved.clients || []);
        setGeneralTxs(saved.generalTxs || []);
        setWorkers(saved.workers || workers);
        setSuppliers(saved.suppliers || []);
        setActiveFY(saved.activeFY || getCurrentFiscalYear());
        setCustomFYs(saved.customFYs || []);
        setNissabPrice(saved.nissabPrice || 85000);
      }
      setLoaded(true);
    };
    loadData();
  }, []);

  // On web, persist full state to AsyncStorage when state changes (db is no-op on web)
  useEffect(() => {
    if (IS_WEB && loaded) {
      storageSaveState({ clients, generalTxs, workers, suppliers, activeFY, customFYs, nissabPrice });
    }
  }, [IS_WEB, loaded, clients, generalTxs, workers, suppliers, activeFY, customFYs, nissabPrice]);

  const resync = async () => {
    if (IS_WEB) return; // on web we persist via useEffect; getFullState returns null
    const data = await getFullState();
    if (data) {
      setClients(data.clients || []);
      setGeneralTxs(data.generalTxs || []);
      setWorkers(data.workers || []);
      setSuppliers(data.suppliers || []);
      setActiveFY(data.activeFY || getCurrentFiscalYear());
      setCustomFYs(data.customFYs || []);
      setNissabPrice(data.nissabPrice ?? 85000);
    }
  };

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
    if (IS_WEB) {
      setClients((p) => [...p, newClient]);
    } else {
      try {
        await upsertClient(newClient);
        await resync();
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const saveClientTx = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const targetClientId = form.clientId || selectedClient;
    const client = clients.find((c) => c.id === targetClientId);
    if (!client) return;
    const tx = { type: form.txType, amount: Number(form.amount), cat: form.cat, note: form.note || "", date };
    if (form.workerId) tx.workerId = form.workerId;
    if (form.supplierId) tx.supplierId = form.supplierId;
    let updatedClient;
    if (form.editTxId) {
      tx.id = form.editTxId;
      updatedClient = {
        ...client,
        txs: client.txs.map((t) => (t.id === form.editTxId ? tx : t)),
      };
    } else {
      tx.id = Date.now();
      updatedClient = { ...client, txs: [...client.txs, tx] };
    }
    if (IS_WEB) {
      setClients((p) => p.map((c) => (c.id === targetClientId ? updatedClient : c)));
    } else {
      try {
        await upsertClient(updatedClient);
        await resync();
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const saveGeneral = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    const date = form.date || new Date().toISOString().split("T")[0];
    const tx = {
      id: Date.now(),
      amount: Number(form.amount),
      cat: form.cat || GENERAL_EXPENSE_CATS[0],
      note: form.note || "",
      date,
    };
    if (IS_WEB) {
      setGeneralTxs((p) => [...p, tx]);
    } else {
      try {
        await upsertGeneralTx(tx);
        await resync();
      } catch (_) {}
    }
    setModal(null);
    setForm({});
  };

  const saveWorker = async () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      const w = workers.find((x) => x.id === form.editId);
      if (!w) return;
      const updated = { ...w, name: form.name.trim(), phone: form.phone || "" };
      if (IS_WEB) {
        setWorkers((p) => p.map((x) => (x.id === form.editId ? updated : x)));
      } else {
        try {
          await upsertWorker(updated);
          await resync();
        } catch (_) {}
      }
    } else {
      const newWorker = { id: Date.now(), name: form.name.trim(), phone: form.phone || "" };
      if (IS_WEB) {
        setWorkers((p) => [...p, newWorker]);
      } else {
        try {
          await upsertWorker(newWorker);
          await resync();
        } catch (_) {}
      }
    }
    setModal(null);
    setForm({});
  };

  const saveSupplier = async () => {
    if (!form.name?.trim()) return;
    if (form.editId) {
      const s = suppliers.find((x) => x.id === form.editId);
      if (!s) return;
      const updated = {
        ...s,
        name: form.name.trim(),
        phone: form.phone || "",
        category: form.category || "",
      };
      if (IS_WEB) {
        setSuppliers((p) => p.map((x) => (x.id === form.editId ? updated : x)));
      } else {
        try {
          await upsertSupplier(updated);
          await resync();
        } catch (_) {}
      }
    } else {
      const newSupplier = {
        id: Date.now(),
        name: form.name.trim(),
        phone: form.phone || "",
        category: form.category || "",
      };
      if (IS_WEB) {
        setSuppliers((p) => [...p, newSupplier]);
      } else {
        try {
          await upsertSupplier(newSupplier);
          await resync();
        } catch (_) {}
      }
    }
    setModal(null);
    setForm({});
  };

  const deleteClientTx = async (cid, tid) => {
    if (IS_WEB) {
      setClients((p) => p.map((c) => (c.id === cid ? { ...c, txs: c.txs.filter((t) => t.id !== tid) } : c)));
      return;
    }
    try {
      await dbDeleteClientTx(cid, tid);
      await resync();
    } catch (_) {}
  };

  const deleteClient = async (cid) => {
    if (IS_WEB) {
      setClients((p) => p.filter((c) => c.id !== cid));
      setSelectedClient(null);
      setTab("clients");
      return;
    }
    try {
      await dbDeleteClient(cid);
      await resync();
    } catch (_) {}
    setSelectedClient(null);
    setTab("clients");
  };

  const toggleStatus = async (cid) => {
    const client = clients.find((c) => c.id === cid);
    if (!client) return;
    const updated = { ...client, status: client.status === "active" ? "done" : "active" };
    if (IS_WEB) {
      setClients((p) => p.map((c) => (c.id === cid ? updated : c)));
      return;
    }
    try {
      await upsertClient(updated);
      await resync();
    } catch (_) {}
  };

  const deleteWorker = async (id) => {
    if (IS_WEB) {
      setWorkers((p) => p.filter((w) => w.id !== id));
      if (selectedWorker === id) setSelectedWorker(null);
      return;
    }
    try {
      await dbDeleteWorker(id);
      await resync();
    } catch (_) {}
    if (selectedWorker === id) setSelectedWorker(null);
  };

  const deleteSupplier = async (id) => {
    if (IS_WEB) {
      setSuppliers((p) => p.filter((s) => s.id !== id));
      if (selectedSupplier === id) setSelectedSupplier(null);
      return;
    }
    try {
      await dbDeleteSupplier(id);
      await resync();
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
    if (!IS_WEB) {
      try {
        await dbSetSettings({ activeFY: fy, customFYs, nissabPrice });
      } catch (_) {}
    }
  };

  const persistSettings = async (partial) => {
    const next = {
      activeFY: partial.activeFY !== undefined ? partial.activeFY : activeFY,
      customFYs: partial.customFYs !== undefined ? partial.customFYs : customFYs,
      nissabPrice: partial.nissabPrice !== undefined ? partial.nissabPrice : nissabPrice,
    };
    if (next.activeFY !== activeFY) setActiveFY(next.activeFY);
    if (next.customFYs !== customFYs) setCustomFYs(next.customFYs);
    if (next.nissabPrice !== nissabPrice) setNissabPrice(next.nissabPrice);
    if (!IS_WEB) {
      try {
        await dbSetSettings(next);
      } catch (_) {}
    }
  };

  const value = {
    clients,
    setClients,
    generalTxs,
    setGeneralTxs,
    workers,
    setWorkers,
    suppliers,
    setSuppliers,
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
    saveClient,
    saveClientTx,
    saveGeneral,
    saveWorker,
    saveSupplier,
    deleteClientTx,
    deleteClient,
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
