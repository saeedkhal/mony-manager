import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";

export default function Header({
  onMenuPress,
  title,
  activeFY,
  onToggleFYPicker,
  onFYChange,
  getCurrentFiscalYear,
  getFiscalYearLabel,
  headerActions,
}) {
  return (
    <View style={[styles.header, { paddingTop: 14 }]}>
      <View style={styles.headerTop}>
        <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        {headerActions && <View style={styles.headerActions}>{headerActions}</View>}
      </View>

      <View style={styles.fySelector}>
        <Text style={styles.fyLabel}>السنة المالية:</Text>
        <View style={styles.fyPickerContainer}>
          <TouchableOpacity style={styles.fyPickerBtn} onPress={onToggleFYPicker}>
            <Text style={styles.fyPickerText}>📅 {activeFY}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.fyLabelSub}>{getFiscalYearLabel(activeFY)}</Text>
        {activeFY !== getCurrentFiscalYear() && (
          <TouchableOpacity
            style={styles.fyResetBtn}
            onPress={() => onFYChange(getCurrentFiscalYear())}
          >
            <Text style={styles.fyResetText}>العودة للحالية</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.09)",
    padding: 14,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  menuButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  menuIcon: {
    fontSize: 24,
    color: "#818cf8",
    fontWeight: "bold",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#818cf8",
    flex: 1,
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  fySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 12,
  },
  fyLabel: {
    color: "#64748b",
    fontSize: 13,
  },
  fyLabelSub: {
    color: "#475569",
    fontSize: 12,
  },
  fyPickerContainer: {
    position: "relative",
  },
  fyPickerBtn: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  fyPickerText: {
    color: "#818cf8",
    fontSize: 13,
  },
  fyPickerDropdown: {
    position: "absolute",
    top: "110%",
    right: 0,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 8,
    zIndex: 100,
    minWidth: 200,
    maxHeight: 300,
  },
  fyPickerList: {
    maxHeight: 250,
  },
  fyPickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 2,
  },
  fyPickerItemActive: {
    backgroundColor: "rgba(129,140,248,0.2)",
  },
  fyPickerItemText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  fyPickerItemTextActive: {
    color: "#818cf8",
  },
  fyPickerItemSubtext: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "400",
  },
  fyResetBtn: {
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    borderRadius: 11,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  fyResetText: {
    color: "#10b981",
    fontSize: 11,
  },
});
