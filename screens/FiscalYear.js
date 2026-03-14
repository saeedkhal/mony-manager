import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getFiscalYears } from "../utils/db";
import { getFiscalYearLabel } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function FiscalYear() {
  const {
    loaded,
    activeFY,
    customFYs,
    setModal,
    handleFYChange,
    persistSettings,
  } = useApp();
  const [allFYs, setAllFYs] = useState([]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getFiscalYears()
      .then((list) => { if (!cancelled && list?.length) setAllFYs(list); })
      .catch(() => { if (!cancelled) setAllFYs([]); });
    return () => { cancelled = true; };
  }, [loaded]);

  const setActive = (fy) => {
    handleFYChange(fy);
  };

  const removeCustomFY = async (fy) => {
    if (fy === activeFY) return;
    await persistSettings({ customFYs: (customFYs || []).filter((f) => f !== fy) });
  };

  return (
    <View style={styles.fiscalYearView}>
      <Text style={styles.fiscalYearTitle}>📅 السنة المالية</Text>
      <Text style={styles.sectionSubtitle}>اختر السنة المالية المعتمدة للعرض والإدخال</Text>

      <View style={styles.fiscalYearList}>
        {(allFYs || []).map((fy) => {
          const isActive = fy === activeFY;
          const isCustom = (customFYs || []).includes(fy);
          return (
            <View key={fy} style={[styles.fiscalYearItem, isActive && styles.fiscalYearItemActive]}>
              <TouchableOpacity
                style={styles.fiscalYearItemTouch}
                onPress={() => setActive(fy)}
                activeOpacity={0.7}
              >
                <View style={styles.fiscalYearItemContent}>
                  <Text style={[styles.fiscalYearItemLabel, isActive && styles.fiscalYearItemLabelActive]}>
                    {getFiscalYearLabel(fy)}
                  </Text>
                  <Text style={styles.fiscalYearItemMeta}>{fy}</Text>
                  {isActive && (
                    <View style={styles.fiscalYearBadge}>
                      <Text style={styles.fiscalYearBadgeText}>الحالية</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              {isCustom && !isActive && (
                <TouchableOpacity
                  style={styles.fiscalYearDeleteBtn}
                  onPress={() => removeCustomFY(fy)}
                >
                  <Text style={styles.deleteBtnText}>حذف</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, styles.fiscalYearAddBtn]}
        onPress={() => setModal("addFY")}
      >
        <Text style={styles.btnText}>+ إضافة سنة مالية</Text>
      </TouchableOpacity>
    </View>
  );
}
