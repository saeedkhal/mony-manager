import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * Global loading overlay with a spinning indicator (antd Spin–style).
 * Shows a semi-transparent overlay and a rotating circle when visible=true.
 */
export default function GlobalSpinner({ visible, tip }) {
  const spinValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacityValue, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(opacityValue, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [visible, opacityValue]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[styles.overlay, { opacity: opacityValue }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {visible ? (
      <View style={styles.box}>
        <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
          <View style={styles.spinnerDot} />
        </Animated.View>
        {tip ? <Text style={styles.tip}>{tip}</Text> : null}
      </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  box: {
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: "center",
    minWidth: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "rgba(99, 102, 241, 0.25)",
    borderTopColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerDot: {
    width: 0,
    height: 0,
  },
  tip: {
    marginTop: 14,
    color: "#94a3b8",
    fontSize: 13,
  },
});
