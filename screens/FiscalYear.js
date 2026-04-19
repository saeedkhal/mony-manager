import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useApp } from "../context/AppContext";
import { getFiscalYears, addFiscalYearLabel } from "../utils/db";
import { getCurrentFiscalYear, getFiscalYearLabel } from "../utils/helpers";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";

function parseFiscalLabelStart(label) {
  const m = String(label || "").trim().match(/^(\d{4})\/(\d{4})$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b !== a + 1) return null;
  return a;
}

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
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [pickedNextLabel, setPickedNextLabel] = useState("");

  const { nextLabel, canAdd } = useMemo(() => {
    const list = allFYs || [];
    const starts = list.map((f) => parseFiscalLabelStart(f.label)).filter((n) => n != null);
    let maxStart = null;
    if (starts.length) maxStart = Math.max(...starts);
    else maxStart = parseFiscalLabelStart(getCurrentFiscalYear());
    if (maxStart == null) {
      const y = new Date().getFullYear();
      maxStart = y;
    }
    const next = `${maxStart + 1}/${maxStart + 2}`;
    const already = list.some((f) => f.label === next);
    return { nextLabel: next, canAdd: !already };
  }, [allFYs]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getFiscalYears()
      .then((list) => {
        if (!cancelled) setAllFYs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setAllFYs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, activeFiscalYearId, customFiscalYearIds]);

  useEffect(() => {
    if (!addFyOpen) {
      setShowYearPicker(false);
      setPickedNextLabel("");
      return;
    }
    if (nextLabel) setPickedNextLabel(nextLabel);
  }, [addFyOpen, nextLabel]);

  const setActive = (fy) => {
    handleFYChange(fy.id, fy.label);
  };

  const removeCustomFY = async (fyId) => {
    if (fyId === activeFiscalYearId) return;
    await persistSettings({
      customFiscalYearIds: (customFiscalYearIds || []).filter((x) => x !== fyId),
    });
    try {
      const nextList = await getFiscalYears();
      setAllFYs(Array.isArray(nextList) ? nextList : []);
    } catch (_) {
      setAllFYs([]);
    }
  };

  const saveNextFiscalYear = async () => {
    const val = (pickedNextLabel || nextLabel || "").trim();
    if (!val || val !== nextLabel || !canAdd) return;
    const match = val.match(/^(\d{4})\/(\d{4})$/);
    if (!match) return;
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const existing = await getFiscalYears();
    const labelTaken = (existing || []).some((r) => r.label === val);
    if (b !== a + 1 || labelTaken) return;
    const newId = await addFiscalYearLabel(val);
    if (newId != null) {
      await persistSettings({
        customFiscalYearIds: [...(customFiscalYearIds || []), newId],
      });
    }
    const nextList = await getFiscalYears();
    if (nextList?.length) setAllFYs(nextList);
    setAddFyOpen(false);
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
                    <View style={styles.fiscalYearRadioWrap} pointerEvents="none">
                      <View
                        style={[
                          styles.fiscalYearRadioOuter,
                          isActive && styles.fiscalYearRadioOuterActive,
                        ]}
                      >
                        {isActive ? <View style={styles.fiscalYearRadioInner} /> : null}
                      </View>
                    </View>
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

          {canAdd && nextLabel ? (
            <TouchableOpacity
              style={styles.fiscalYearAddCard}
              onPress={() => setAddFyOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.fiscalYearAddCardTitle}>➕ إضافة سنة مالية جديدة</Text>
              <Text style={styles.fiscalYearAddCardHint}>التالية المتاحة: {nextLabel}</Text>
              <Text style={styles.fiscalYearAddCardSub}>{getFiscalYearLabel(nextLabel)}</Text>
              <Text style={[styles.fiscalYearAddCardSub, { marginTop: 4, opacity: 0.85 }]}>
                يُسمح بإضافة السنة التي تلي أحدث سنة مسجّلة فقط
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.fiscalYearAddMuted}>
              <Text style={styles.fiscalYearAddMutedText}>
                لا توجد سنة مالية جديدة للإضافة حالياً (أحدث سنة مسجّلة متاحة بالفعل).
              </Text>
            </View>
          )}
        </View>
      </ScreenLayout>
      <CustomModal visible={addFyOpen} onClose={() => setAddFyOpen(false)}>
        <Text style={styles.modalTitle}>📅 إضافة سنة مالية</Text>
        <Text style={styles.modalSubtitle}>
          اختر السنة التالية فقط — لا يمكن إضافة سنوات سابقة أو تخطي سنة.
        </Text>
        {nextLabel && canAdd ? (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>السنة المالية</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowYearPicker((p) => !p)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerBtnText, { color: "#e0e7ff", fontWeight: "700" }]}>
                    {pickedNextLabel || nextLabel}
                  </Text>
                  <Text style={[styles.fiscalYearItemMeta, { marginTop: 4 }]}>
                    {getFiscalYearLabel(pickedNextLabel || nextLabel)}
                  </Text>
                </View>
                <Text style={styles.pickerBtnArrow}>▾</Text>
              </TouchableOpacity>
              {showYearPicker ? (
                <View style={styles.pickerDropdown}>
                  <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity
                      style={[
                        styles.pickerItem,
                        (pickedNextLabel || nextLabel) === nextLabel && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        setPickedNextLabel(nextLabel);
                        setShowYearPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          (pickedNextLabel || nextLabel) === nextLabel && styles.pickerItemTextActive,
                          { fontWeight: "700" },
                        ]}
                      >
                        {nextLabel}
                      </Text>
                      <Text style={[styles.fiscalYearItemMeta, { marginTop: 2 }]}>
                        {getFiscalYearLabel(nextLabel)}
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            styles.modalSaveBtn,
            (!pickedNextLabel || pickedNextLabel !== nextLabel || !canAdd) && { opacity: 0.45 },
          ]}
          disabled={!pickedNextLabel || pickedNextLabel !== nextLabel || !canAdd}
          onPress={saveNextFiscalYear}
        >
          <Text style={styles.btnText}>إضافة السنة ✓</Text>
        </TouchableOpacity>
      </CustomModal>
    </>
  );
}
