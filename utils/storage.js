import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadState as dbLoadState, saveState as dbSaveState } from "./db";

const LEGACY_KEY = "mall_v4";

/**
 * Load app state from SQLite. Returns { clients, generalTxs, workers, suppliers, activeFY, customFYs, nissabPrice } or null.
 * On first run after switching from AsyncStorage, migrates legacy data from AsyncStorage into SQLite.
 */
export const initState = async () => {
  try {
    let data = await dbLoadState();
    if (data === null && AsyncStorage?.getItem) {
      const raw = await AsyncStorage.getItem(LEGACY_KEY);
      if (raw) {
        const legacy = JSON.parse(raw);
        data = {
          clients: legacy.clients || [],
          generalTxs: legacy.generalTxs || [],
          workers: legacy.workers || [],
          suppliers: legacy.suppliers || [],
          activeFY: legacy.activeFY || null,
          customFYs: legacy.customFYs || [],
          nissabPrice: legacy.nissabPrice ?? null,
        };
        await dbSaveState(data);
      }
    }
    return data;
  } catch (error) {
    console.warn("Error loading state (will use defaults):", error?.message || error);
    return null;
  }
};

/**
 * Persist full app state to SQLite.
 */
export const saveState = async (data) => {
  try {
    await dbSaveState(data);
  } catch (error) {
    if (error?.message && !error.message.includes("Native module is null")) {
      console.error("Error saving state:", error.message);
    }
  }
};
