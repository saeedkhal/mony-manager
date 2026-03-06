import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";
import { getFiscalYearLabel } from "../utils/helpers";
import styles from "../styles/AppStyles";

export default function FiscalYear() {
  const {
    clients,
    generalTxs,
    workers,
    suppliers,
    activeFY,
    customFYs,
    setActiveFY,
    setCustomFYs,
    setModal,
    handleFYChange,
  } = useApp();
  const { allFYs } = useAppData(clients, generalTxs, workers, suppliers, activeFY, customFYs);

  const setActive = (fy) => {
    handleFYChange(fy);
  };

  const removeCustomFY = (fy) => {
    if (fy === activeFY) return;
    setCustomFYs((prev) => prev.filter((f) => f !== fy));
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
