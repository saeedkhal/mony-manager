import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getFiscalYears } from "../utils/db";
import { getFiscalYearLabel } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

export default function FiscalYear() {
  const {
    loaded,
    activeFiscalYearId,
    customFiscalYearIds,
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
  }, [loaded, activeFiscalYearId]);

  const setActive = (fy) => {
    handleFYChange(fy.id, fy.label);
  };

  const removeCustomFY = async (fyId) => {
    if (fyId === activeFiscalYearId) return;
    await persistSettings({
      customFiscalYearIds: (customFiscalYearIds || []).filter((x) => x !== fyId),
    });
  };

  return (
    <ScreenLayout>
      <View style={styles.fiscalYearView}>
        <Text style={styles.fiscalYearTitle}>📅 السنة المالية</Text>
        <Text style={styles.sectionSubtitle}>اختر السنة المالية المعتمدة للعرض والإدخال</Text>

        <View style={styles.fiscalYearList}>
          {(allFYs || []).map((fy) => {
            const isActive = fy.id === activeFiscalYearId;
            const isCustom = (customFiscalYearIds || []).includes(fy.id);
            return (
              <View key={fy.id} style={[styles.fiscalYearItem, isActive && styles.fiscalYearItemActive]}>
                <TouchableOpacity
                  style={styles.fiscalYearItemTouch}
                  onPress={() => setActive(fy)}
                  activeOpacity={0.7}
                >
                  <View style={styles.fiscalYearItemContent}>
                    <Text style={[styles.fiscalYearItemLabel, isActive && styles.fiscalYearItemLabelActive]}>
                      {getFiscalYearLabel(fy.label)}
                    </Text>
                    <Text style={styles.fiscalYearItemMeta}>{fy.label}</Text>
                    <Text style={styles.fiscalYearItemMeta}>#{fy.id}</Text>
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
                    onPress={() => removeCustomFY(fy.id)}
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
    </ScreenLayout>
  );
}
