import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import styles from "../styles/AppStyles";
import { useKeyboardAwareScroll } from "../hooks/useKeyboardBottomPad";

/**
 * Wraps screen content in a scrollable view with the app's content padding and dark background.
 * Use as the root wrapper for stack screens so content scrolls and layout matches the original app.
 */
export default function ScreenLayout({ children, contentContainerStyle, scrollViewProps }) {
  const insets = useSafeAreaInsets();
  const { scrollRef, keyboardPad, onScroll, Provider } = useKeyboardAwareScroll();
  const {
    contentContainerStyle: extraContentStyle,
    onScroll: extraOnScroll,
    ...restScrollProps
  } = scrollViewProps || {};

  return (
    <Provider>
      <View style={[styles.container, { flex: 1 }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            { padding: 24, paddingBottom: 24 + insets.bottom + keyboardPad, flexGrow: 0 },
            contentContainerStyle,
            extraContentStyle,
          ]}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          {...restScrollProps}
          ref={scrollRef}
          onScroll={(e) => {
            onScroll(e);
            extraOnScroll?.(e);
          }}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </View>
    </Provider>
  );
}
