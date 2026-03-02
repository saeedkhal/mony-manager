import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Pressable, Animated, StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function Drawer({ visible, onClose, navItems, activeTab, onTabChange, drawerAnimation }) {
  if (!visible) return null;

  return (
    <Pressable style={styles.drawerOverlay} onPress={onClose}>
      <Animated.View
        style={[
          styles.drawerContent,
          {
            transform: [{ translateX: drawerAnimation }],
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>القائمة</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.drawerClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.drawerList}>
          {navItems.map(([k, ic, l]) => (
            <TouchableOpacity
              key={k}
              style={[styles.drawerItem, activeTab === k && styles.drawerItemActive]}
              onPress={() => {
                onTabChange(k);
                onClose();
              }}
            >
              <Text style={styles.drawerItemIcon}>{ic}</Text>
              <Text style={[styles.drawerItemText, activeTab === k && styles.drawerItemTextActive]}>
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 9999,
    elevation: 9999,
  },
  drawerContent: {
    position: "absolute",
    top: 0,
    right: 0,
    width: SCREEN_WIDTH * 0.75,
    maxWidth: 320,
    height: "100%",
    backgroundColor: "#1e1b4b",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    zIndex: 10000,
    elevation: 10000,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#818cf8",
  },
  drawerClose: {
    fontSize: 24,
    color: "#94a3b8",
    fontWeight: "300",
  },
  drawerList: {
    flex: 1,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  drawerItemActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
    borderRightWidth: 3,
    borderRightColor: "#6366f1",
  },
  drawerItemIcon: {
    fontSize: 24,
    marginLeft: 12,
    width: 30,
  },
  drawerItemText: {
    fontSize: 16,
    color: "#94a3b8",
    fontWeight: "400",
    flex: 1,
  },
  drawerItemTextActive: {
    color: "#818cf8",
    fontWeight: "700",
  },
});
