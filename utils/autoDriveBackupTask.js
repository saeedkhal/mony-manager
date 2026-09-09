import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { loadAutoBackupSettings, runAutoDriveBackupIfDue } from "./autoDriveBackup";

export const AUTO_DRIVE_BACKUP_TASK = "omola-auto-drive-backup";

/** Check about once an hour; actual upload only when nextDueAt has passed. */
const MINIMUM_INTERVAL_MINUTES = 60;

TaskManager.defineTask(AUTO_DRIVE_BACKUP_TASK, async () => {
  try {
    const result = await runAutoDriveBackupIfDue();
    if (result.reason === "failed") {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerAutoDriveBackupTask() {
  if (Platform.OS === "web") return { registered: false, reason: "web" };

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return { registered: false, reason: "restricted" };
    }

    const already = await TaskManager.isTaskRegisteredAsync(AUTO_DRIVE_BACKUP_TASK);
    if (!already) {
      await BackgroundTask.registerTaskAsync(AUTO_DRIVE_BACKUP_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
    }
    return { registered: true };
  } catch {
    return { registered: false, reason: "error" };
  }
}

export async function unregisterAutoDriveBackupTask() {
  if (Platform.OS === "web") return;
  try {
    const already = await TaskManager.isTaskRegisteredAsync(AUTO_DRIVE_BACKUP_TASK);
    if (already) {
      await BackgroundTask.unregisterTaskAsync(AUTO_DRIVE_BACKUP_TASK);
    }
  } catch {
    // ignore
  }
}

/** Sync OS background registration with saved settings.enabled. */
export async function syncAutoDriveBackupTaskRegistration() {
  if (Platform.OS === "web") return;
  const settings = await loadAutoBackupSettings();
  if (settings.enabled) {
    await registerAutoDriveBackupTask();
  } else {
    await unregisterAutoDriveBackupTask();
  }
}
