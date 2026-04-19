import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import * as Google from "expo-auth-session/providers/google";
import { useApp } from "../context/AppContext";
import { getDatabaseBackupPayload } from "../utils/db";
import {
  clearStoredGoogleAuth,
  GOOGLE_DRIVE_EXTRA_SCOPES,
  listBackupFilesFromDrive,
  loadStoredTokenResponse,
  persistTokenResponse,
  uploadDatabaseBackupToDrive,
} from "../utils/googleDriveBackup";
import {
  GDRIVE_BACKUP_FOLDER_NAME,
  getExpoAppSlug,
  getExpoProjectFullName,
  getGoogleOAuthClientIdsForAuthRequest,
  getGoogleOAuthRedirectUri,
  isExpoGo,
  isGoogleDriveConfigured,
  useExpoGoGoogleWebOAuthFlow as expoGoGoogleWebOAuth,
} from "../constants/googleDriveConfig";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

function backupFileName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `mall_backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
}

function formatBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDriveTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function Backups() {
  const { loaded } = useApp();
  const { androidClientId, iosClientId, webClientId } = getGoogleOAuthClientIdsForAuthRequest();
  /** @owner/slug for Expo auth proxy — set EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME or expo.owner + slug. */
  const projectNameForProxy = getExpoProjectFullName() || undefined;
  const oauthRedirectUri = getGoogleOAuthRedirectUri();

  const [request, response, promptAsync] = Google.useAuthRequest(
    {
      androidClientId,
      iosClientId,
      webClientId,
      scopes: GOOGLE_DRIVE_EXTRA_SCOPES,
      extraParams: { access_type: "offline" },
      ...(oauthRedirectUri ? { redirectUri: oauthRedirectUri } : {}),
    },
    // projectNameForProxy: Expo Go auth.expo.io only.
    expoGoGoogleWebOAuth() && projectNameForProxy ? { projectNameForProxy } : {}
  );

  const [hasLocalAuth, setHasLocalAuth] = useState(false);
  const [files, setFiles] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [listError, setListError] = useState("");

  const refreshLocalAuthFlag = useCallback(async () => {
    const t = await loadStoredTokenResponse();
    setHasLocalAuth(!!t?.accessToken);
  }, []);

  const loadList = useCallback(async () => {
    const t = await loadStoredTokenResponse();
    if (!t?.accessToken) {
      setFiles([]);
      return;
    }
    setLoadingList(true);
    setListError("");
    try {
      const { files: f } = await listBackupFilesFromDrive();
      setFiles(f);
    } catch (e) {
      setListError(e?.message || String(e));
      setFiles([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    refreshLocalAuthFlag();
  }, [loaded, refreshLocalAuthFlag]);

  useEffect(() => {
    if (!loaded) return;
    if (response?.type === "success" && response.authentication) {
      persistTokenResponse(response.authentication).then(() => {
        refreshLocalAuthFlag();
        loadList();
      });
    } else if (response?.type === "error") {
      const oauthCode = response.error?.params?.error;
      if (oauthCode === "access_denied") {
        Alert.alert(
          "Google — تم رفض الوصول",
          "غالبًا السبب إعدادات موافقة Google وليس التطبيق نفسه:\n\n" +
            "• لو شاشة الموافقة (OAuth consent) على وضع Testing: أضف البريد الذي تسجّل به ضمن Test users.\n" +
            "• من APIs & Services → OAuth consent screen تأكد أن نطاق Drive مسموح (Scopes).\n" +
            "• لو ضغطت إلغاء أو رفض في نافذة Google، حاول مرة أخرى واقبل الصلاحيات."
        );
      } else {
        Alert.alert("Google", response.error?.message || "فشل تسجيل الدخول");
      }
    }
  }, [response, loaded, refreshLocalAuthFlag, loadList]);

  useEffect(() => {
    if (!loaded || !hasLocalAuth) return;
    loadList();
  }, [loaded, hasLocalAuth, loadList]);

  const onSignOut = async () => {
    await clearStoredGoogleAuth();
    setHasLocalAuth(false);
    setFiles([]);
    setListError("");
  };

  const onBackupNow = async () => {
    if (!hasLocalAuth) {
      Alert.alert("نسخ احتياطي", "سجّل الدخول بحساب Google أولًا.");
      return;
    }
    setUploading(true);
    setListError("");
    try {
      const payload = await getDatabaseBackupPayload();
      if (!payload) {
        Alert.alert("نسخ احتياطي", "لا توجد بيانات محلية للنسخ (ويب بدون بيانات بعد).");
        return;
      }
      const name = backupFileName(payload.extension);
      await uploadDatabaseBackupToDrive({ fileName: name, bytes: payload.bytes });
      Alert.alert("تم", "تم رفع النسخة إلى Google Drive.");
      await loadList();
    } catch (e) {
      Alert.alert("فشل الرفع", e?.message || String(e));
    } finally {
      setUploading(false);
    }
  };

  if (!loaded) {
    return (
      <ScreenLayout>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </ScreenLayout>
    );
  }

  const configured = isGoogleDriveConfigured();
  const expoGoOAuthReady = !isExpoGo() || !!oauthRedirectUri;

  const onLinkGoogle = () => {
    if (isExpoGo() && !oauthRedirectUri) {
      Alert.alert(
        "Expo Go",
        "Google لا يقبل عنوان exp:// كـ redirect.\n\n" +
          "في ملف .env أضف مثلًا:\n" +
          "EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@اسم_حسابك_على_Expo/MyApp\n\n" +
          "أو في app.json داخل \"expo\" أضف \"owner\": \"اسم_حسابك\" ثم أعد التشغيل مع --clear.\n\n" +
          "وسجّل نفس الرابط في Google Cloud → Web client → Authorized redirect URIs:\n" +
          "https://auth.expo.io/@اسمك/MyApp"
      );
      return;
    }
    promptAsync();
  };

  return (
    <ScreenLayout>
      <View style={styles.backupView}>
        <Text style={styles.backupTitle}>☁️ النسخ الاحتياطي (Google Drive)</Text>
        <Text style={styles.sectionSubtitle}>
          نسخ قاعدة البيانات الحالية إلى مجلد على حساب Google الخاص بك، وعرض وتحميل النسخ من هناك.
        </Text>

        <View style={styles.backupPrivacyBox}>
          <Text style={styles.backupPrivacyTitle}>صلاحيتك على Drive بتاعك</Text>
          <Text style={styles.backupPrivacyLine}>
            • لما تضغط «ربط Google»، أنت اللي توافق من نافذة Google على صلاحية الوصول لـ Drive بتاع حسابك.
          </Text>
          <Text style={styles.backupPrivacyLine}>
            • الرفع والجلب (قائمة الملفات) بيتعملوا من التطبيق على جهازك مباشرةً مع Google — مفيش نسخ احتياطية بتتخزّن على سيرفر صاحب التطبيق.
          </Text>
          <Text style={styles.backupPrivacyLine}>
            • النسخ بتظهر في مجلد «{GDRIVE_BACKUP_FOLDER_NAME}» جوّا Drive بتاعك؛ تقدر تلغي ربط التطبيق من «خروج» هنا أو من أمان حساب Google.
          </Text>
        </View>

        {!configured && (
          <Text style={styles.backupHint}>
            أضف معرّفات OAuth في بيئة البناء: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID،
            EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID، و EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID للويب. فعّل Google Drive API
            في Google Cloud، وأضف عنوان إعادة التوجيه: com.saeedkhaled.omola:/oauthredirect
          </Text>
        )}

        {configured && expoGoGoogleWebOAuth() && (
          <Text style={styles.backupHint}>
            {oauthRedirectUri
              ? `Expo Go: في Google Cloud → Web client → Authorized redirect URIs أضف بالضبط:\n${oauthRedirectUri}`
              : `Expo Go: أضف في .env مثلًا EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@حسابك_على_Expo/${getExpoAppSlug()} أو في app.json حقل \"owner\" ثم أعد npx expo start --clear.`}
          </Text>
        )}

        {configured && Platform.OS !== "web" && !isExpoGo() && (
          <Text style={styles.backupHint}>
            Android: تأكد من OAuth client (Android) بنفس Package و SHA-1 للتوقيع المستخدم في الـ APK. في Google Cloud أنشئ
            أيضًا OAuth client من نوع Web وأضف في Authorized redirect URIs بالضبط:{" "}
            {oauthRedirectUri || "com.saeedkhaled.omola:/oauthredirect"} ثم أعد بناء التطبيق وتثبيته.
          </Text>
        )}

        <View style={styles.backupActionsRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { flex: 1, minWidth: 140 }]}
            disabled={!request || !configured || hasLocalAuth || !expoGoOAuthReady}
            onPress={onLinkGoogle}
          >
            <Text style={styles.btnText}>🔗 ربط Google</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.backupBtnSecondary, { flex: 1, minWidth: 120 }]}
            disabled={!hasLocalAuth}
            onPress={onSignOut}
          >
            <Text style={styles.btnText}>خروج</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.fiscalYearAddBtn]}
          disabled={!configured || uploading || !hasLocalAuth}
          onPress={onBackupNow}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>⬆️ نسخ الآن إلى Drive</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.backupBtnSecondary, styles.fiscalYearAddBtn]}
          disabled={!hasLocalAuth || loadingList}
          onPress={loadList}
        >
          {loadingList ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>↻ تحديث القائمة</Text>
          )}
        </TouchableOpacity>

        {listError ? <Text style={styles.backupErrorText}>{listError}</Text> : null}

        <Text style={styles.fiscalYearTitle}>النسخ على Drive</Text>
        {!hasLocalAuth ? (
          <Text style={styles.backupHint}>اربط حساب Google لعرض القائمة.</Text>
        ) : loadingList && files.length === 0 ? (
          <ActivityIndicator color="#94a3b8" style={{ marginTop: 12 }} />
        ) : files.length === 0 ? (
          <Text style={styles.backupHint}>لا توجد ملفات بعد. استخدم «نسخ الآن».</Text>
        ) : (
          <View style={styles.backupList}>
            {files.map((f) => (
              <View key={f.id} style={styles.backupItem}>
                <Text style={styles.backupItemName}>{f.name}</Text>
                <Text style={styles.backupItemMeta}>
                  آخر تعديل: {formatDriveTime(f.modifiedTime)} · {formatBytes(f.size)}
                </Text>
                <TouchableOpacity
                  style={styles.backupOpenLink}
                  onPress={() => Linking.openURL(`https://drive.google.com/file/d/${f.id}/view`)}
                >
                  <Text style={styles.backupOpenLinkText}>فتح في Google Drive</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScreenLayout>
  );
}
