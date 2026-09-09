import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useApp } from "../context/AppContext";
import { getDatabaseBackupPayload, restoreDatabaseFromBackup } from "../utils/db";
import {
  clearStoredGoogleAuth,
  downloadBackupFileFromDrive,
  enforceDriveBackupRetention,
  GOOGLE_DRIVE_EXTRA_SCOPES,
  listBackupFilesFromDrive,
  loadStoredTokenResponse,
  persistTokenResponse,
  uploadDatabaseBackupToDrive,
} from "../utils/googleDriveBackup";
import {
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

function isRestorableBackupName(name) {
  const n = String(name || "").toLowerCase();
  return n.endsWith(".db") || n.endsWith(".json");
}

export default function Backups() {
  const { loaded, reloadFromDatabase } = useApp();
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
  const [restoringId, setRestoringId] = useState(null);
  const [manualBackupBusy, setManualBackupBusy] = useState(false);
  const [importingLocalBackup, setImportingLocalBackup] = useState(false);
  const [activeTab, setActiveTab] = useState("drive");
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
      const sortedFiles = [...(f || [])].sort(
        (a, b) => new Date(b?.modifiedTime || 0).getTime() - new Date(a?.modifiedTime || 0).getTime()
      );
      setFiles(sortedFiles);
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

  const restoreSelectedBackup = useCallback(
    async (bytes, fileName, busyId) => {
      setRestoringId(busyId);
      setListError("");
      try {
        await restoreDatabaseFromBackup(bytes, fileName);
        await reloadFromDatabase();
        Alert.alert("تم", "تمت استعادة البيانات من النسخة الاحتياطية.");
      } catch (e) {
        Alert.alert("فشل الاستعادة", e?.message || String(e));
      } finally {
        setRestoringId(null);
      }
    },
    [reloadFromDatabase]
  );

  const onUseBackup = (file) => {
    if (!file?.id || !isRestorableBackupName(file.name)) {
      Alert.alert("استعادة", "نوع الملف غير مدعوم للاستعادة.");
      return;
    }
    Alert.alert(
      "استعادة النسخة الاحتياطية",
      `سيتم استبدال كل البيانات المحلية الحالية بالنسخة:\n${file.name}\n\nهل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "استخدم",
          style: "destructive",
          onPress: async () => {
            try {
              const bytes = await downloadBackupFileFromDrive(file.id);
              await restoreSelectedBackup(bytes, file.name, file.id);
            } catch (e) {
              Alert.alert("فشل الاستعادة", e?.message || String(e));
            }
          },
        },
      ]
    );
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
      await enforceDriveBackupRetention(5);
      await loadList();
      Alert.alert("تم", "تم رفع النسخة إلى Google Drive وتحديث القائمة (آخر 5 نسخ فقط).");
    } catch (e) {
      Alert.alert("فشل الرفع", e?.message || String(e));
    } finally {
      setUploading(false);
    }
  };

  const onManualShareBackup = async () => {
    setManualBackupBusy(true);
    try {
      const payload = await getDatabaseBackupPayload();
      if (!payload) {
        Alert.alert("نسخ يدوي", "لا توجد بيانات محلية للنسخ.");
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("نسخ يدوي", "المشاركة غير متاحة على هذا الجهاز.");
        return;
      }

      const fileName = backupFileName(payload.extension);
      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true, intermediates: true });
      file.write(payload.bytes);

      await Sharing.shareAsync(file.uri, {
        mimeType: payload.extension === "json" ? "application/json" : "application/octet-stream",
        dialogTitle: "مشاركة النسخة الاحتياطية عبر واتساب أو تليجرام",
        UTI: payload.extension === "json" ? "public.json" : "public.database",
      });
    } catch (e) {
      Alert.alert("فشل النسخ اليدوي", e?.message || String(e));
    } finally {
      setManualBackupBusy(false);
    }
  };

  const onImportLocalBackup = async () => {
    setImportingLocalBackup(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.name || !asset?.uri) {
        Alert.alert("استيراد", "تعذر قراءة الملف المختار.");
        return;
      }

      if (!isRestorableBackupName(asset.name)) {
        Alert.alert("استيراد", "اختر ملف نسخة احتياطية بصيغة .db أو .json.");
        return;
      }

      const pickedFile = new File(asset);
      const bytes = await pickedFile.bytes();
      Alert.alert(
        "استيراد نسخة محلية",
        `سيتم استبدال كل البيانات الحالية بالملف:\n${asset.name}\n\nهل تريد المتابعة؟`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "استيراد",
            style: "destructive",
            onPress: async () => {
              await restoreSelectedBackup(bytes, asset.name, "local-import");
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("فشل الاستيراد", e?.message || String(e));
    } finally {
      setImportingLocalBackup(false);
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
        <Text style={styles.backupTitle}>☁️ النسخ الاحتياطي</Text>
        <Text style={styles.sectionSubtitle}>
          اختر بين نسخ Google Drive أو نسخة يدوية تشاركها فورًا عبر واتساب أو تليجرام، مع استيراد من ملف محلي.
        </Text>

        <View style={styles.backupTabsRow}>
          <TouchableOpacity
            style={[styles.optionBtn, styles.backupTabBtn, activeTab === "drive" && styles.optionBtnActive]}
            onPress={() => setActiveTab("drive")}
          >
            <Text style={[styles.optionBtnText, activeTab === "drive" && styles.optionBtnTextActive]}>
              ☁️ Google Drive
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionBtn, styles.backupTabBtn, activeTab === "manual" && styles.optionBtnActive]}
            onPress={() => setActiveTab("manual")}
          >
            <Text style={[styles.optionBtnText, activeTab === "manual" && styles.optionBtnTextActive]}>
              📤 نسخ يدوي
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "drive" ? (
          <>
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

            <View style={styles.backupActionsRow}>
              {!hasLocalAuth && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, { flex: 1, minWidth: 140 }]}
                  disabled={!request || !configured || !expoGoOAuthReady}
                  onPress={onLinkGoogle}
                >
                  <Text style={styles.btnText}>🔗 ربط Google</Text>
                </TouchableOpacity>
              )}
              {hasLocalAuth && (
                <TouchableOpacity
                  style={[styles.btn, styles.backupBtnSecondary, { flex: 1, minWidth: 120 }]}
                  onPress={onSignOut}
                >
                  <Text style={styles.btnText}>خروج</Text>
                </TouchableOpacity>
              )}
            </View>

            {hasLocalAuth && (
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, styles.fiscalYearAddBtn]}
                disabled={!configured || uploading}
                onPress={onBackupNow}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>⬆️ نسخ الآن إلى Drive</Text>
                )}
              </TouchableOpacity>
            )}

            {hasLocalAuth && (
              <TouchableOpacity
                style={[styles.btn, styles.backupBtnSecondary, styles.fiscalYearAddBtn]}
                disabled={loadingList}
                onPress={loadList}
              >
                {loadingList ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>↻ تحديث القائمة</Text>
                )}
              </TouchableOpacity>
            )}

            {listError ? <Text style={styles.backupErrorText}>{listError}</Text> : null}

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
                    <View style={styles.backupItemActions}>
                      {isRestorableBackupName(f.name) ? (
                        <TouchableOpacity disabled={restoringId != null} onPress={() => onUseBackup(f)}>
                          {restoringId === f.id ? (
                            <ActivityIndicator color="#34d399" size="small" />
                          ) : (
                            <Text style={styles.backupUseLinkText}>استخدم</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={styles.backupOpenLink}
                        onPress={() => Linking.openURL(`https://drive.google.com/file/d/${f.id}/view`)}
                      >
                        <Text style={styles.backupOpenLinkText}>فتح في Google Drive</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.fiscalYearAddBtn]}
              disabled={manualBackupBusy}
              onPress={onManualShareBackup}
            >
              {manualBackupBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>📤 مشاركة النسخة الاحتياطية</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.backupBtnSecondary, styles.fiscalYearAddBtn]}
              disabled={importingLocalBackup || restoringId != null}
              onPress={onImportLocalBackup}
            >
              {importingLocalBackup || restoringId === "local-import" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>📥 استيراد نسخة من الجهاز</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScreenLayout>
  );
}
