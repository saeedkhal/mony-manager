import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Animated, Dimensions } from "react-native";
import { initState, saveState } from "../utils/storage";
import { getCurrentFiscalYear } from "../utils/helpers";
import { PROJECT_TYPES } from "../constants";

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
  const drawerAnimation = useRef(new Animated.Value(SCREEN_WIDTH * 0.75)).current;

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
      drawerAnimation.setValue(SCREEN_WIDTH * 0.75);
      Animated.timing(drawerAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showDrawer]);

  const closeDrawer = () => {
    Animated.timing(drawerAnimation, {
      toValue: SCREEN_WIDTH * 0.75,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowDrawer(false));
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
