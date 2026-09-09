import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";
import { getDatabaseBackupPayload } from "./db";
import {
  enforceDriveBackupRetention,
  loadStoredTokenResponse,
  uploadDatabaseBackupToDrive,
} from "./googleDriveBackup";

export const AUTO_BACKUP_STORAGE_KEY = "drive_auto_backup_settings_v1";
export const DRIVE_BACKUP_RETENTION = 5;

/** @typedef {'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'} AutoBackupInterval */

export const AUTO_BACKUP_INTERVALS = [
  { id: "daily", label: "كل يوم", months: 0, days: 1 },
  { id: "weekly", label: "كل أسبوع", months: 0, days: 7 },
  { id: "monthly", label: "كل شهر", months: 1, days: 0 },
  { id: "quarterly", label: "كل 3 شهور", months: 3, days: 0 },
  { id: "semiannual", label: "كل 6 شهور", months: 6, days: 0 },
  { id: "yearly", label: "كل سنة", months: 12, days: 0 },
];

const DEFAULT_SETTINGS = {
  enabled: false,
  interval: "weekly",
  hour: 2,
  lastSuccessAt: null,
  nextDueAt: null,
  inProgress: false,
};

export function backupFileName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `mall_backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
}

function clampHour(hour) {
  const n = Number(hour);
  if (!Number.isFinite(n)) return 2;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

function isValidInterval(interval) {
  return AUTO_BACKUP_INTERVALS.some((x) => x.id === interval);
}

function addInterval(fromDate, interval) {
  const meta = AUTO_BACKUP_INTERVALS.find((x) => x.id === interval) || AUTO_BACKUP_INTERVALS[1];
  const d = new Date(fromDate.getTime());
  if (meta.months > 0) {
    d.setMonth(d.getMonth() + meta.months);
  }
  if (meta.days > 0) {
    d.setDate(d.getDate() + meta.days);
  }
  return d;
}

/** Next due at local `hour:00`, based on last success (or now when enabling). */
export function computeNextDueAt({ lastSuccessAt, interval, hour, fromDate = new Date() }) {
  const h = clampHour(hour);
  const iv = isValidInterval(interval) ? interval : "weekly";
  const base = lastSuccessAt ? new Date(lastSuccessAt) : new Date(fromDate);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date(fromDate);
    fallback.setMinutes(0, 0, 0);
    fallback.setHours(h);
    if (fallback.getTime() <= fromDate.getTime()) {
      return addInterval(fallback, iv).toISOString();
    }
    return fallback.toISOString();
  }

  let next = addInterval(base, iv);
  next.setMinutes(0, 0, 0);
  next.setHours(h);

  // If interval math landed before/equal now (timezone edge), bump one more cycle.
  const now = fromDate.getTime();
  let guard = 0;
  while (next.getTime() <= now && guard < 24) {
    next = addInterval(next, iv);
    next.setMinutes(0, 0, 0);
    next.setHours(h);
    guard += 1;
  }
  return next.toISOString();
}

/** When enabling with no prior success: next occurrence of chosen hour (today or tomorrow). */
export function computeFirstDueAt({ hour, fromDate = new Date() }) {
  const h = clampHour(hour);
  const next = new Date(fromDate);
  next.setMinutes(0, 0, 0);
  next.setHours(h);
  if (next.getTime() <= fromDate.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export async function loadAutoBackupSettings() {
  try {
    const raw = await AsyncStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      hour: clampHour(parsed?.hour),
      interval: isValidInterval(parsed?.interval) ? parsed.interval : DEFAULT_SETTINGS.interval,
      enabled: !!parsed?.enabled,
      inProgress: !!parsed?.inProgress,
      lastSuccessAt: parsed?.lastSuccessAt || null,
      nextDueAt: parsed?.nextDueAt || null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveAutoBackupSettings(partial) {
  const current = await loadAutoBackupSettings();
  const next = {
    ...current,
    ...partial,
    hour: clampHour(partial?.hour ?? current.hour),
    interval: isValidInterval(partial?.interval ?? current.interval)
      ? partial?.interval ?? current.interval
      : current.interval,
  };
  await AsyncStorage.setItem(AUTO_BACKUP_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function isBackupDue(settings, now = new Date()) {
  if (!settings?.enabled) return false;
  if (!settings.nextDueAt) return true;
  const due = new Date(settings.nextDueAt).getTime();
  if (Number.isNaN(due)) return true;
  return due <= now.getTime();
}

export function formatCountdownRemaining(nextDueAt, now = new Date()) {
  if (!nextDueAt) return "—";
  const due = new Date(nextDueAt).getTime();
  if (Number.isNaN(due)) return "—";
  const diffMs = due - now.getTime();
  if (diffMs <= 0) return "مستحق الآن";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (days === 0 && hours === 0) parts.push(`${Math.max(1, minutes)} دقيقة`);
  return `فاضل ${parts.join(" و ")}`;
}

async function isOnline() {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  }
  try {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch {
    return false;
  }
}

/**
 * Upload DB backup to Drive and enforce retention. Throws on failure.
 * Shared by manual and automatic flows.
 */
export async function performDriveBackupUpload() {
  const payload = await getDatabaseBackupPayload();
  if (!payload) {
    throw new Error("لا توجد بيانات محلية للنسخ.");
  }
  const name = backupFileName(payload.extension);
  await uploadDatabaseBackupToDrive({ fileName: name, bytes: payload.bytes });
  await enforceDriveBackupRetention(DRIVE_BACKUP_RETENTION);
  return { fileName: name };
}

/** Same-process lock so AppState + NetInfo + UI don't double-upload. */
let memoryLock = false;

/**
 * Silent auto-backup when due. No UI. Retries later if offline or mid-run failure.
 * @returns {Promise<{ ran: boolean, reason?: string }>}
 */
export async function runAutoDriveBackupIfDue() {
  if (Platform.OS === "web") {
    return { ran: false, reason: "web" };
  }

  if (memoryLock) {
    return { ran: false, reason: "busy" };
  }

  const settings = await loadAutoBackupSettings();
  if (!settings.enabled) {
    return { ran: false, reason: "disabled" };
  }
  if (!isBackupDue(settings)) {
    return { ran: false, reason: "not-due" };
  }

  const token = await loadStoredTokenResponse();
  if (!token?.accessToken) {
    return { ran: false, reason: "no-auth" };
  }

  const online = await isOnline();
  if (!online) {
    return { ran: false, reason: "offline" };
  }

  // Stale AsyncStorage inProgress (app killed mid-upload) is ignored and retried.
  memoryLock = true;
  await saveAutoBackupSettings({ inProgress: true });

  try {
    await performDriveBackupUpload();
    const now = new Date();
    const nextDueAt = computeNextDueAt({
      lastSuccessAt: now.toISOString(),
      interval: settings.interval,
      hour: settings.hour,
      fromDate: now,
    });
    await saveAutoBackupSettings({
      inProgress: false,
      lastSuccessAt: now.toISOString(),
      nextDueAt,
    });
    return { ran: true };
  } catch {
    // Do not advance lastSuccessAt / nextDueAt — retry when online again.
    await saveAutoBackupSettings({ inProgress: false });
    return { ran: false, reason: "failed" };
  } finally {
    memoryLock = false;
  }
}

/**
 * Persist schedule UI changes and sync nextDueAt.
 * When enabling for the first time (no lastSuccess), schedule first due at chosen hour.
 */
export async function updateAutoBackupSchedule({ enabled, interval, hour }) {
  const current = await loadAutoBackupSettings();
  const nextInterval = isValidInterval(interval) ? interval : current.interval;
  const nextHour = clampHour(hour ?? current.hour);
  const nextEnabled = enabled != null ? !!enabled : current.enabled;

  let nextDueAt = current.nextDueAt;
  if (nextEnabled) {
    if (current.lastSuccessAt) {
      const computed = computeNextDueAt({
        lastSuccessAt: current.lastSuccessAt,
        interval: nextInterval,
        hour: nextHour,
      });
      // Past due → mark due now so hybrid triggers run ASAP (e.g. after offline).
      nextDueAt =
        new Date(computed).getTime() <= Date.now() ? new Date().toISOString() : computed;
    } else {
      nextDueAt = computeFirstDueAt({ hour: nextHour });
    }
  }

  return saveAutoBackupSettings({
    enabled: nextEnabled,
    interval: nextInterval,
    hour: nextHour,
    nextDueAt: nextEnabled ? nextDueAt : current.nextDueAt,
  });
}
