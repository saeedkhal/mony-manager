import * as Application from "expo-application";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

/**
 * Set these in `.env` (Expo loads `EXPO_PUBLIC_*` at build time) or in your EAS secrets.
 * Google Cloud: enable Drive API, configure OAuth consent, then create OAuth client IDs
 * (Web, Android, iOS). For Android/iOS the redirect used by expo-auth-session is:
 *   {android.package or ios.bundleIdentifier}:/oauthredirect
 * Register that URI where the provider asks for authorized redirect URIs.
 *
 * Expo Go on Android: use the Web OAuth client ID (and auth.expo.io redirect in Google Cloud),
 * not the Android native client — see getGoogleOAuthClientIdsForAuthRequest().
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "";

export const GDRIVE_BACKUP_FOLDER_NAME = "مول عموله — نسخ احتياطية";

/**
 * صلاحية Google Drive المعتمدة في واجهة برمجة التطبيقات:
 * - افتراضيًا `drive.file`: إنشاء/قراءة/تحديث الملفات التي ينشئها التطبيق داخل حساب المستخدم فقط (أخفّ على سياسات Google).
 * - لو `EXPO_PUBLIC_GOOGLE_DRIVE_FULL=true` أو `=1`: `drive` كامل — قراءة وكتابة في Drive الخاص بالمستخدم (قد تحتاج مراجعة أمان من Google عند النشر).
 * في الحالتين: البيانات على Drive بتاع المستخدم؛ مفيش تخزين نسخ احتياطية على سيرفر المطوّر.
 */
export function getGoogleDriveApiScopes() {
  const full =
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_FULL === "1" ||
    process.env.EXPO_PUBLIC_GOOGLE_DRIVE_FULL === "true";
  if (full) {
    return ["https://www.googleapis.com/auth/drive"];
  }
  return ["https://www.googleapis.com/auth/drive.file"];
}

export function getGoogleOAuthClientIds() {
  return {
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  };
}

/** Reads Expo native shell info from the native module (manifest JSON when embedded). */
function getExponentConstants() {
  return NativeModules.ExponentConstants;
}

/** Expo app slug from the embedded manifest (fallback MyApp). */
function parseManifestObject() {
  const ec = getExponentConstants();
  const m = ec?.manifest;
  if (m == null) return null;
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
    } catch {
      return null;
    }
  }
  if (typeof m === "object") return m;
  return null;
}

export function getExpoAppSlug() {
  const manifest = parseManifestObject();
  if (manifest && typeof manifest.slug === "string") return manifest.slug;
  return "MyApp";
}

/** Android applicationId / iOS bundleIdentifier (expo-constants first, then embedded manifest). */
function getNativeApplicationIdFromManifest() {
  const cfg = Constants.expoConfig;
  const fromConstants =
    Platform.OS === "android"
      ? cfg?.android?.package
      : Platform.OS === "ios"
        ? cfg?.ios?.bundleIdentifier
        : cfg?.android?.package || cfg?.ios?.bundleIdentifier;
  if (typeof fromConstants === "string" && fromConstants.length > 0) return fromConstants;

  const manifest = parseManifestObject();
  if (!manifest || typeof manifest !== "object") return null;
  const androidPkg = manifest.android && typeof manifest.android.package === "string" ? manifest.android.package : null;
  const iosBundle =
    manifest.ios && typeof manifest.ios.bundleIdentifier === "string" ? manifest.ios.bundleIdentifier : null;
  if (Platform.OS === "android") return androidPkg || iosBundle;
  if (Platform.OS === "ios") return iosBundle || androidPkg;
  return androidPkg || iosBundle;
}

/**
 * @owner/slug for https://auth.expo.io — required for Google OAuth in Expo Go (not exp://...).
 * Set EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@yourExpoUser/MyApp if auto-detect fails.
 */
export function getExpoProjectFullName() {
  const envFull = process.env.EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME?.trim();
  if (envFull?.startsWith("@")) return envFull.replace(/\/+$/, "");

  const manifest = parseManifestObject();
  if (manifest) {
    if (typeof manifest.originalFullName === "string" && manifest.originalFullName.startsWith("@")) {
      return manifest.originalFullName.replace(/\/+$/, "");
    }
    const ownerRaw = manifest.owner || process.env.EXPO_PUBLIC_EXPO_OWNER?.trim();
    const slug = typeof manifest.slug === "string" ? manifest.slug : getExpoAppSlug();
    if (ownerRaw && slug) {
      return `@${String(ownerRaw).replace(/^@/, "")}/${slug}`;
    }
  }
  return null;
}

/** True when the JS bundle runs inside the Expo Go app (not a dev/standalone build). */
export function isExpoGo() {
  return getExponentConstants()?.appOwnership === "expo";
}

/**
 * Same redirect as legacy `AuthSession.makeRedirectUri({ useProxy: true, projectNameForProxy })`
 * (expo-auth-session v7 removed those options from `makeRedirectUri`; URL is still `https://auth.expo.io/@owner/slug`).
 *
 * @param {string} projectNameForProxy e.g. `@saeedkhaled/MyApp`
 * @returns {string|undefined}
 */
export function makeExpoProxyRedirectUri(projectNameForProxy) {
  if (projectNameForProxy == null || typeof projectNameForProxy !== "string") return undefined;
  const name = projectNameForProxy.trim().replace(/\/+$/, "");
  if (!name.startsWith("@")) return undefined;
  return `https://auth.expo.io/${name}`;
}

/**
 * Google OAuth redirect: Expo Go must use Expo's HTTPS proxy — Google rejects exp://...
 * Register the exact URL on the Web OAuth client's Authorized redirect URIs.
 *
 * Prefer `EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@owner/slug` (or `expo.owner` + slug in app config) so
 * `projectNameForProxy` is explicit; else `AuthSession.getRedirectUrl()` uses expo-constants when available.
 */
export function getGoogleOAuthRedirectUri() {
  const override = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;

  if (isExpoGo()) {
    const fullName = getExpoProjectFullName();
    if (fullName) {
      return makeExpoProxyRedirectUri(fullName);
    }
    try {
      return AuthSession.getRedirectUrl();
    } catch {
      return undefined;
    }
  }

  // Dev client (expo-dev-client) uses executionEnvironment "storeClient"; `makeRedirectUri({ native })`
  // ignores `native` there and falls back to exp:// — Google then cannot reopen the app. Use the real
  // application id + path (same as expo-auth-session/providers/google default on native).
  if (Platform.OS !== "web") {
    const appId =
      typeof Application.applicationId === "string" && Application.applicationId.length > 0
        ? Application.applicationId
        : getNativeApplicationIdFromManifest();
    if (!appId) return undefined;
    return `${appId}:/oauthredirect`;
  }

  return undefined;
}

/** Expo Go + Web client: Google OAuth proxy flow (Android and iOS). */
export function useExpoGoGoogleWebOAuthFlow() {
  return isExpoGo() && !!GOOGLE_WEB_CLIENT_ID;
}

/** @deprecated use useExpoGoGoogleWebOAuthFlow — was Android-only */
export function shouldUseWebClientIdForGoogleOnAndroid() {
  return Platform.OS === "android" && useExpoGoGoogleWebOAuthFlow();
}

/** Client IDs for Google.useAuthRequest — Expo Go uses Web client ID on native (required with auth.expo.io). */
export function getGoogleOAuthClientIdsForAuthRequest() {
  const ids = getGoogleOAuthClientIds();
  if (useExpoGoGoogleWebOAuthFlow()) {
    return { ...ids, androidClientId: ids.webClientId, iosClientId: ids.webClientId };
  }
  return ids;
}

/** Same client ID used when refreshing tokens (must match login). */
export function getGoogleOAuthClientIdForTokenRefresh() {
  const { webClientId, iosClientId, androidClientId } = getGoogleOAuthClientIds();
  if (useExpoGoGoogleWebOAuthFlow()) return webClientId;
  if (Platform.OS === "android") return androidClientId;
  if (Platform.OS === "ios") return iosClientId;
  return webClientId;
}

export function isGoogleDriveConfigured() {
  if (useExpoGoGoogleWebOAuthFlow()) {
    return !!GOOGLE_WEB_CLIENT_ID;
  }
  if (Platform.OS === "android") return !!GOOGLE_ANDROID_CLIENT_ID;
  if (Platform.OS === "ios") return !!GOOGLE_IOS_CLIENT_ID;
  if (Platform.OS === "web") return !!GOOGLE_WEB_CLIENT_ID;
  return !!(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
}
