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
  setSettings as dbSetSettings,
  setActiveFiscalYearById,
  removeFiscalYearById,
  deleteClientTx as dbDeleteClientTx,
  getActiveFiscalYear,
  getActiveFiscalYearId,
  getFiscalYearRowById,
  ensureFiscalYearLabel,
} from "../utils/db";
import { getCurrentFiscalYear } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AppContext = createContext();

export function AppProvider({ children }) {
  const [activeFiscalYearId, setActiveFiscalYearId] = useState(null);
  const [activeFiscalYearLabel, setActiveFiscalYearLabel] = useState(getCurrentFiscalYear());
  const [customFiscalYearIds, setCustomFiscalYearIds] = useState([]);
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
      setCustomFiscalYearIds(s.customFiscalYearIds || []);

      await getActiveFiscalYear();
      let id = await getActiveFiscalYearId();
      if (s.activeFiscalYearId != null && !Number.isNaN(Number(s.activeFiscalYearId))) {
        id = Number(s.activeFiscalYearId);
      }
      if (id == null) {
        const ensured = await ensureFiscalYearLabel(getCurrentFiscalYear());
        if (ensured != null) id = ensured;
      }
      setActiveFiscalYearId(id);
      const row = id != null ? await getFiscalYearRowById(id) : null;
      const label = row?.label || (await getActiveFiscalYear()) || getCurrentFiscalYear();
      setActiveFiscalYearLabel(label);
      if (id != null) {
        try {
          await setActiveFiscalYearById(id, label);
        } catch (_) {}
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

  const handleFYChange = async (fiscalYearId, displayLabel = null) => {
    if (fiscalYearId == null) return;
    let label = displayLabel;
    if (label == null) {
      const row = await getFiscalYearRowById(fiscalYearId);
      label = row?.label ?? "";
    }
    setActiveFiscalYearId(Number(fiscalYearId));
    setActiveFiscalYearLabel(label || getCurrentFiscalYear());
    try {
      await setActiveFiscalYearById(fiscalYearId, label);
    } catch (_) {}
  };

  const persistSettings = async (partial) => {
    const next = {
      activeFiscalYearId:
        partial.activeFiscalYearId !== undefined
          ? partial.activeFiscalYearId
          : activeFiscalYearId,
      customFiscalYearIds:
        partial.customFiscalYearIds !== undefined
          ? partial.customFiscalYearIds
          : customFiscalYearIds,
    };
    if (partial.activeFiscalYearId !== undefined) {
      const fid = next.activeFiscalYearId;
      setActiveFiscalYearId(fid);
      const row = fid != null ? await getFiscalYearRowById(fid) : null;
      setActiveFiscalYearLabel(row?.label || activeFiscalYearLabel);
      await setActiveFiscalYearById(fid, row?.label);
    }
    if (partial.customFiscalYearIds !== undefined) {
      const prevSet = new Set(customFiscalYearIds);
      const nextSet = new Set(next.customFiscalYearIds);
      for (const fid of prevSet) {
        if (!nextSet.has(fid)) await removeFiscalYearById(fid);
      }
      setCustomFiscalYearIds(next.customFiscalYearIds);
      try {
        await dbSetSettings({ customFiscalYearIds: next.customFiscalYearIds });
      } catch (_) {}
    }
    if (partial.nissabPrice !== undefined) {
      try {
        await dbSetSettings({ nissabPrice: partial.nissabPrice });
      } catch (_) {}
    }
  };

  const value = {
    loaded,
    modal,
    setModal,
    form,
    setForm,
    activeFiscalYearId,
    activeFiscalYearLabel,
    customFiscalYearIds,
    setCustomFiscalYearIds,
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
