import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

export default function CustomModal({ visible, onClose, children, centered = false }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={0}
      >
        <Pressable style={[styles.modalOverlay, centered && styles.modalOverlayCentered]} onPress={onClose}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {children}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
  },
  modalOverlayCentered: {
    justifyContent: "center",
    paddingBottom: 0,
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
  scrollContent: {
    paddingBottom: 80,
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
