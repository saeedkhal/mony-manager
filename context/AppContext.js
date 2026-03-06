import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Animated, Dimensions } from "react-native";
import { initState, saveState } from "../utils/storage";
import { getCurrentFiscalYear } from "../utils/helpers";
import { PROJECT_TYPES, CLIENT_EXPENSE_CATS, GENERAL_EXPENSE_CATS } from "../constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AppContext = createContext();

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

  const handleFYChange = (fy) => {
    setActiveFY(fy);
    setShowFYPicker(false);
    setSelectedClient(null);
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
