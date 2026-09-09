import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useApp } from "../context/AppContext";
import { resetLocalDatabase } from "../utils/db";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

export default function DevReset() {
  const { reloadFromDatabase, setModal, setForm } = useApp();
  const [busy, setBusy] = useState(false);

  if (!__DEV__) return null;

  const runReset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resetLocalDatabase();
      setModal(null);
      setForm({});
      await reloadFromDatabase();
      Alert.alert("تم المسح", "البيانات اتمسحت. التطبيق بقى فاضي زي أول تشغيل.");
    } catch (_) {
      Alert.alert("تعذر المسح", "حصل خطأ أثناء مسح قاعدة البيانات. حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = () => {
    Alert.alert(
      "مسح كل البيانات؟",
      "هتتمسح كل العملاء والمعاملات والمخزن والصنايعية والموردين والسنوات المالية. كإنك فتحت التطبيق أول مرة. مفيش رجوع.",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "امسح الكل", style: "destructive", onPress: runReset },
      ]
    );
  };

  return (
    <ScreenLayout>
      <View style={styles.fiscalYearView}>
        <Text style={styles.fiscalYearTitle}>🧹 مسح البيانات</Text>
        <Text style={styles.sectionSubtitle}>صفحة تطوير فقط — الزر مش بيظهر في نسخة الإنتاج</Text>
        <View
          style={[
            styles.card,
            { borderColor: "rgba(244,63,94,0.35)", backgroundColor: "rgba(244,63,94,0.08)" },
          ]}
        >
          <Text style={{ color: "#fecdd3", fontSize: 14, lineHeight: 22, textAlign: "right" }}>
            الزر بيمسح قاعدة البيانات المحلية ويرجع التطبيق فاضي، مع أصناف المخزن الافتراضية والسنة المالية الحالية.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnExpense, { opacity: busy ? 0.6 : 1 }]}
          onPress={confirmReset}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Reset قاعدة البيانات</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScreenLayout>
  );
}
