import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useApp } from "../context/AppContext";
import { GENERAL_EXPENSE_CATS } from "../constants";
import styles from "../styles/AppStyles";

export default function HeaderActions() {
  const {
    tab,
    setModal,
    setForm,
  } = useApp();

  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {tab === "clients" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => {
            setForm({});
            setModal("addClient");
          }}
        >
          <Text style={styles.btnText}>+ عميل جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "workers" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnWorker]}
          onPress={() => {
            setForm({});
            setModal("addWorker");
          }}
        >
          <Text style={styles.btnText}>+ صنايعي جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "suppliers" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnSupplier]}
          onPress={() => {
            setForm({});
            setModal("addSupplier");
          }}
        >
          <Text style={styles.btnText}>+ مورد جديد</Text>
        </TouchableOpacity>
      )}
      {tab === "general" && (
        <TouchableOpacity
          style={[styles.btn, styles.btnGeneral]}
          onPress={() => {
            setForm({ cat: GENERAL_EXPENSE_CATS[0], date: new Date().toISOString().split("T")[0] });
            setModal("addGeneral");
          }}
        >
          <Text style={styles.btnText}>+ مصروف عام</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
