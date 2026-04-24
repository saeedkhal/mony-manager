import AsyncStorage from "@react-native-async-storage/async-storage";
import { TokenResponse } from "expo-auth-session";
import * as GoogleProvider from "expo-auth-session/providers/google";

import {
  GDRIVE_BACKUP_FOLDER_NAME,
  getGoogleDriveApiScopes,
  getGoogleOAuthClientIdForTokenRefresh,
} from "../constants/googleDriveConfig";

const AUTH_STORAGE_KEY = "google_drive_backup_auth_v1";

const discovery = GoogleProvider.discovery;

function textEnc(s) {
  return new TextEncoder().encode(s);
}

function concatBytes(parts) {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** يُمرَّر لـ Google.useAuthRequest — صلاحيات Drive على حساب المستخدم (بدون سيرفر للمطوّر). */
export const GOOGLE_DRIVE_EXTRA_SCOPES = getGoogleDriveApiScopes();

function getClientIdForRefresh() {
  return getGoogleOAuthClientIdForTokenRefresh();
}

export async function loadStoredTokenResponse() {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data?.accessToken) return null;
    return new TokenResponse(data);
  } catch {
    return null;
  }
}

export async function persistTokenResponse(token) {
  if (!token) {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  const cfg = token.getRequestConfig();
  if (!cfg.refreshToken) {
    try {
      const prevRaw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (prevRaw) {
        const prev = JSON.parse(prevRaw);
        if (prev.refreshToken) cfg.refreshToken = prev.refreshToken;
      }
    } catch {
      /* ignore */
    }
  }
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(cfg));
}

export async function clearStoredGoogleAuth() {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

async function getFreshAccessToken() {
  let token = await loadStoredTokenResponse();
  if (!token) throw new Error("لم يتم تسجيل الدخول في Google بعد.");
  const clientId = getClientIdForRefresh();
  if (!clientId) throw new Error("معرّف عميل Google غير مضبوط.");

  if (token.refreshToken && token.shouldRefresh()) {
    await token.refreshAsync({ clientId }, discovery);
    await persistTokenResponse(token);
  } else if (!TokenResponse.isTokenFresh(token)) {
    throw new Error("انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى.");
  }

  return token.accessToken;
}

async function findOrCreateBackupFolder(accessToken) {
  const q = encodeURIComponent(
    `name='${GDRIVE_BACKUP_FOLDER_NAME.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`
  );
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Drive list folder failed: ${listRes.status} ${t}`);
  }
  const listJson = await listRes.json();
  if (listJson.files?.length) return listJson.files[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: GDRIVE_BACKUP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Drive create folder failed: ${createRes.status} ${t}`);
  }
  const created = await createRes.json();
  return created.id;
}

export async function listBackupFilesFromDrive() {
  const accessToken = await getFreshAccessToken();
  const folderId = await findOrCreateBackupFolder(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=modifiedTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive list files failed: ${res.status} ${t}`);
  }
  const json = await res.json();
  return { files: json.files || [], folderId };
}

export async function enforceDriveBackupRetention(maxFiles = 5) {
  const keepCount = Math.max(0, Number(maxFiles) || 0);
  const accessToken = await getFreshAccessToken();
  const folderId = await findOrCreateBackupFolder(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Drive list for retention failed: ${listRes.status} ${t}`);
  }

  const listJson = await listRes.json();
  const files = listJson.files || [];
  const oldFiles = files.slice(keepCount);
  if (oldFiles.length === 0) return { deletedCount: 0 };

  for (const f of oldFiles) {
    const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!delRes.ok) {
      const t = await delRes.text();
      throw new Error(`Drive delete old backup failed: ${delRes.status} ${t}`);
    }
  }

  return { deletedCount: oldFiles.length };
}

function buildMultipartRelated(metadata, fileBytes) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metaJson = JSON.stringify(metadata);
  const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const suffix = `\r\n--${boundary}--`;
  const body = concatBytes([textEnc(prefix), fileBytes, textEnc(suffix)]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

export async function uploadDatabaseBackupToDrive({ fileName, bytes }) {
  const accessToken = await getFreshAccessToken();
  const folderId = await findOrCreateBackupFolder(accessToken);
  const metadata = { name: fileName, parents: [folderId] };
  const { body, contentType } = buildMultipartRelated(metadata, bytes);
  const url =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${t}`);
  }
  return res.json();
}
