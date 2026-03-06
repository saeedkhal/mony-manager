import React from "react";
import { View } from "react-native";
import Dashboard from "./Dashboard";
import Clients from "./Clients";
import Workers from "./Workers";
import Suppliers from "./Suppliers";
import General from "./General";
import Zakat from "./Zakat";
import FiscalYear from "./FiscalYear";
import { useApp } from "../context/AppContext";

export default function MainContent() {
  const { tab } = useApp();

  return (
    <View>
      {tab === "dashboard" && <Dashboard />}
      {tab === "clients" && <Clients />}
      {tab === "workers" && <Workers />}
      {tab === "suppliers" && <Suppliers />}
      {tab === "general" && <General />}
      {tab === "zakat" && <Zakat />}
      {tab === "fiscalyear" && <FiscalYear />}
    </View>
  );
}
