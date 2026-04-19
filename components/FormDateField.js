import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

/**
 * Date field for forms: Android system date picker, iOS text field (YYYY-MM-DD).
 * @param {object} styles - App styles with inputGroup, inputLabel, input
 * @param {string} [label]
 * @param {string} [value] - YYYY-MM-DD or empty
 * @param {(ymd: string) => void} onChangeValue
 * @param {boolean} [active] - when false, closes any open Android picker (e.g. modal hidden)
 */
export default function FormDateField({ styles: S, label = "التاريخ", value, onChangeValue, active = true }) {
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!active) setShowPicker(false);
  }, [active]);

  const pickerDate = useMemo(() => {
    const raw = value;
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      const [y, m, d] = String(raw).split("-").map((n) => Number(n));
      return new Date(y, (m || 1) - 1, d || 1);
    }
    return new Date();
  }, [value]);

  const applyDate = (selected) => {
    if (!selected) return;
    const y = selected.getFullYear();
    const mo = String(selected.getMonth() + 1).padStart(2, "0");
    const day = String(selected.getDate()).padStart(2, "0");
    onChangeValue(`${y}-${mo}-${day}`);
  };

  return (
    <View style={S.inputGroup}>
      <Text style={S.inputLabel}>{label}</Text>
      {Platform.OS === "android" ? (
        <>
          <TouchableOpacity style={S.input} activeOpacity={0.75} onPress={() => setShowPicker(true)}>
            <Text style={{ color: value ? "#f1f5f9" : "#64748b", fontSize: 15 }}>
              {value || "اختر التاريخ"}
            </Text>
          </TouchableOpacity>
          {showPicker ? (
            <DateTimePicker
              value={pickerDate}
              mode="date"
              display="default"
              onChange={(event, selected) => {
                setShowPicker(false);
                if (event.type === "dismissed") return;
                applyDate(selected);
              }}
            />
          ) : null}
        </>
      ) : (
        <TextInput
          style={S.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          value={value || ""}
          onChangeText={(text) => onChangeValue(text)}
        />
      )}
    </View>
  );
}
