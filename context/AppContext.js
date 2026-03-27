import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Animated, Dimensions } from "react-native";
import { initState } from "../utils/storage";
import {
  getSettings,
  setActiveFiscalYear,
  addFiscalYearLabel,
  removeFiscalYearLabel,
  deleteClientTx as dbDeleteClientTx,
  setSettings as dbSetSettings,
} from "../utils/db";
import { getCurrentFiscalYear } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeFY, setActiveFY] = useState(getCurrentFiscalYear());
  const [customFYs, setCustomFYs] = useState([]);
  const [nissabPrice, setNissabPrice] = useState(85000);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [showFYPicker, setShowFYPicker] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clientsRefreshKey, setClientsRefreshKey] = useState(0);
  const [generalRefreshKey, setGeneralRefreshKey] = useState(0);
  const drawerAnimation = useRef(new Animated.Value(-SCREEN_WIDTH * 0.75)).current;

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

  const refreshClients = () => setClientsRefreshKey((k) => k + 1);
  const refreshGeneral = () => setGeneralRefreshKey((k) => k + 1);

  const deleteClientTx = async (cid, tid) => {
    try {
      await dbDeleteClientTx(cid, tid);
    } catch (_) {}
  };

  const handleFYChange = async (fy) => {
    setActiveFY(fy);
    setShowFYPicker(false);
    try {
      await setActiveFiscalYear(fy);
    } catch (_) {}
  };

  const persistSettings = async (partial) => {
    const next = {
      activeFY: partial.activeFY !== undefined ? partial.activeFY : activeFY,
      customFYs: partial.customFYs !== undefined ? partial.customFYs : customFYs,
      nissabPrice: partial.nissabPrice !== undefined ? partial.nissabPrice : nissabPrice,
    };
    if (partial.activeFY !== undefined) {
      setActiveFY(next.activeFY);
      try {
        await setActiveFiscalYear(next.activeFY);
      } catch (_) {}
    }
    if (partial.customFYs !== undefined) {
      const prevSet = new Set(customFYs);
      const nextSet = new Set(next.customFYs);
      for (const label of nextSet) {
        if (!prevSet.has(label)) await addFiscalYearLabel(label);
      }
      for (const label of prevSet) {
        if (!nextSet.has(label)) await removeFiscalYearLabel(label);
      }
      setCustomFYs(next.customFYs);
    }
    if (partial.nissabPrice !== undefined) {
      setNissabPrice(next.nissabPrice);
      try {
        await dbSetSettings({ nissabPrice: next.nissabPrice });
      } catch (_) {}
    }
  };

  const value = {
    loaded,
    clientsRefreshKey,
    generalRefreshKey,
    modal,
    setModal,
    form,
    setForm,
    activeFY,
    setActiveFY,
    customFYs,
    setCustomFYs,
    nissabPrice,
    setNissabPrice,
    showFYPicker,
    setShowFYPicker,
    showClientPicker,
    setShowClientPicker,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
    refreshClients,
    refreshGeneral,
    deleteClientTx,
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
