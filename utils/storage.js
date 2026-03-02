import AsyncStorage from "@react-native-async-storage/async-storage";

export const initState = async () => {
  try {
    // Check if AsyncStorage is available
    if (!AsyncStorage || typeof AsyncStorage.getItem !== 'function') {
      console.warn("AsyncStorage is not available");
      return null;
    }
    const data = await AsyncStorage.getItem("mall_v4");
    return data ? JSON.parse(data) : null;
  } catch (error) {
    // Silently fail - app will start with default state
    console.warn("Error loading state (will use defaults):", error.message);
    return null;
  }
};

export const saveState = async (data) => {
  try {
    // Check if AsyncStorage is available
    if (!AsyncStorage || typeof AsyncStorage.setItem !== 'function') {
      console.warn("AsyncStorage is not available, cannot save state");
      return;
    }
    await AsyncStorage.setItem("mall_v4", JSON.stringify(data));
  } catch (error) {
    // Don't throw - just log the error so app continues to work
    // The error is expected if native module isn't loaded yet
    if (error.message && !error.message.includes('Native module is null')) {
      console.error("Error saving state:", error.message);
    }
  }
};
