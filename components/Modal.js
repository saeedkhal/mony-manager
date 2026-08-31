import React, { useEffect } from "react";
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import styles from "../styles/AppStyles";
import { useKeyboardBottomPad } from "../hooks/useKeyboardBottomPad";

/**
 * Full-screen form page that replaces the popup overlay.
 * Parent screens keep mounting this alongside the list; when visible it covers the screen.
 */
export default function CustomModal({ visible = true, onClose, children }) {
  const insets = useSafeAreaInsets();
  const keyboardPad = useKeyboardBottomPad();

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={pageStyles.fill}>
      <ScrollView
        style={pageStyles.flex}
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 24 + insets.bottom + keyboardPad,
        }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <View style={[styles.clientDetailBackRow, { marginBottom: 16 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Text style={styles.backBtnText}>←</Text>
            <Text style={styles.backBtnText}>رجوع</Text>
          </TouchableOpacity>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const pageStyles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    zIndex: 30,
    elevation: 30,
  },
  flex: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
