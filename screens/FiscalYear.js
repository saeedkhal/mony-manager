import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { getFiscalYears, addFiscalYearLabel } from "../utils/db";
import { getFiscalYearLabel } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormTextInput from "../components/FormTextInput";

export default function FiscalYear() {
  const {
    loaded,
    activeFiscalYearId,
    customFiscalYearIds,
    handleFYChange,
    persistSettings,
  } = useApp();
  const [allFYs, setAllFYs] = useState([]);
  const [addFyOpen, setAddFyOpen] = useState(false);
  const [customFY, setCustomFY] = useState("");

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getFiscalYears()
      .then((list) => { if (!cancelled && list?.length) setAllFYs(list); })
      .catch(() => { if (!cancelled) setAllFYs([]); });
    return () => { cancelled = true; };
  }, [loaded, activeFiscalYearId]);

  useEffect(() => {
    if (!addFyOpen) setCustomFY("");
  }, [addFyOpen]);

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
    <>
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
                          <Text style={styles.fiscalYearBadgeText}>نشط</Text>
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
            onPress={() => setAddFyOpen(true)}
          >
            <Text style={styles.btnText}>+ إضافة سنة مالية</Text>
          </TouchableOpacity>
        </View>
      </ScreenLayout>
      <CustomModal visible={addFyOpen} onClose={() => setAddFyOpen(false)}>
        <Text style={styles.modalTitle}>📅 إضافة سنة مالية</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>السنة المالية (مثال: 2025/2026)</Text>
          <FormTextInput
            styles={styles}
            placeholder="2025/2026"
            placeholderTextColor="#64748b"
            value={customFY}
            onChangeText={(text) => setCustomFY(text.trim())}
          />
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.modalSaveBtn]}
          onPress={async () => {
            const val = (customFY || "").trim();
            const match = val.match(/^(\d{4})\/(\d{4})$/);
            if (match) {
              const a = parseInt(match[1], 10);
              const b = parseInt(match[2], 10);
              const existing = await getFiscalYears();
              const labelTaken = (existing || []).some((r) => r.label === val);
              if (b === a + 1 && !labelTaken) {
                const newId = await addFiscalYearLabel(val);
                if (newId != null) {
                  await persistSettings({
                    customFiscalYearIds: [...(customFiscalYearIds || []), newId],
                  });
                }
                const nextList = await getFiscalYears();
                if (nextList?.length) setAllFYs(nextList);
                setCustomFY("");
                setAddFyOpen(false);
              }
            }
          }}
        >
          <Text style={styles.btnText}>إضافة السنة ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
