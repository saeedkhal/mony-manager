import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import styles from "../styles/AppStyles";

/**
 * Wraps screen content in a scrollable view with the app's content padding and dark background.
 * Use as the root wrapper for stack screens so content scrolls and layout matches the original app.
 */
export default function ScreenLayout({ children, contentContainerStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { flex: 1 }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { padding: 24, paddingBottom: 24 + insets.bottom },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={true}
      >
        {children}
      </ScrollView>
    </View>
  );
}
