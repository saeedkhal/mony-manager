import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useApp } from "../context/AppContext";
import { runAutoDriveBackupIfDue } from "../utils/autoDriveBackup";
import { syncAutoDriveBackupTaskRegistration } from "../utils/autoDriveBackupTask";

/**
 * Registers background task when enabled, and silently runs due backups
 * on app foreground and when connectivity returns.
 */
export default function AutoDriveBackupRunner() {
  const { loaded } = useApp();
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!loaded || Platform.OS === "web") return;

    let cancelled = false;

    const tryRun = async () => {
      if (cancelled) return;
      try {
        await runAutoDriveBackupIfDue();
      } catch {
        // silent
      }
    };

    syncAutoDriveBackupTaskRegistration().catch(() => {});
    tryRun();

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") tryRun();
    });

    const netSub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      if (online && wasOfflineRef.current) {
        tryRun();
      }
      wasOfflineRef.current = !online;
    });

    return () => {
      cancelled = true;
      appSub.remove();
      netSub();
    };
  }, [loaded]);

  return null;
}
