import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 320);
const HIDDEN_X = -DRAWER_WIDTH;

export default function Drawer({
  visible,
  onClose,
  navItems,
  activeTab,
  onTabChange,
  safeAreaBottom = 0,
}) {
  const translateX = useRef(new Animated.Value(HIDDEN_X)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 200 : 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: visible ? 0 : HIDDEN_X,
        duration: visible ? 220 : 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, overlayOpacity, translateX]);

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={styles.host}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.drawerContent,
          { bottom: safeAreaBottom, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>القائمة</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.drawerClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.drawerList} keyboardShouldPersistTaps="handled">
          {navItems.map(([k, ic, l]) => (
            <TouchableOpacity
              key={k}
              style={[styles.drawerItem, activeTab === k && styles.drawerItemActive]}
              onPress={() => onTabChange(k)}
            >
              <Text style={styles.drawerItemIcon}>{ic}</Text>
              <Text style={[styles.drawerItemText, activeTab === k && styles.drawerItemTextActive]}>
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawerContent: {
    position: "absolute",
    top: 24,
    right: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#1e1b4b",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 16,
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
