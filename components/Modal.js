import React from "react";
import { Modal, Pressable, ScrollView, TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function CustomModal({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>إلغاء</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
  },
  modalCancelBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
  },
});
