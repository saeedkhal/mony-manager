import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { Animated, Dimensions } from "react-native";
import { initState } from "../utils/storage";
import {
  getSettings,
  setActiveFiscalYear,
  addFiscalYearLabel,
  removeFiscalYearLabel,
  deleteClientTx as dbDeleteClientTx,
} from "../utils/db";
import { getCurrentFiscalYear } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeFY, setActiveFY] = useState(getCurrentFiscalYear());
  const [customFYs, setCustomFYs] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const drawerAnimation = useRef(
    new Animated.Value(-SCREEN_WIDTH * 0.75),
  ).current;

  useEffect(() => {
    const loadData = async () => {
      await initState();
      const s = await getSettings();
      console.log("s", s);
      if (s) {
        setActiveFY(s.activeFY || getCurrentFiscalYear());
        setCustomFYs(s.customFYs || []);
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

  const deleteClientTx = async (cid, tid) => {
    try {
      await dbDeleteClientTx(cid, tid);
    } catch (_) {}
  };

  const handleFYChange = async (fy) => {
    console.log("fy", fy);
    setActiveFY(fy);
    try {
      await setActiveFiscalYear(fy);
    } catch (_) {}
  };

  const persistSettings = async (partial) => {
    const next = {
      activeFY: partial.activeFY !== undefined ? partial.activeFY : activeFY,
      customFYs:
        partial.customFYs !== undefined ? partial.customFYs : customFYs,
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
  };

  const value = {
    loaded,
    modal,
    setModal,
    form,
    setForm,
    activeFY,
    setActiveFY,
    customFYs,
    setCustomFYs,
    showClientPicker,
    setShowClientPicker,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
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
