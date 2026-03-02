import React from "react";
import { View, ScrollView } from "react-native";
import Dashboard from "./Dashboard";
import Clients from "./Clients";
import Workers from "./Workers";
import Suppliers from "./Suppliers";
import General from "./General";
import Zakat from "./Zakat";
import { useApp } from "../context/AppContext";
import { useAppData } from "../hooks/useAppData";

export default function MainContent() {
  const { tab, clients, generalTxs, workers, suppliers, activeFY } = useApp();
  const appData = useAppData(clients, generalTxs, workers, suppliers, activeFY);

  return (
    <ScrollView style={{ flex: 1, padding: 24 }} showsVerticalScrollIndicator={false}>
      {tab === "dashboard" && <Dashboard appData={appData} />}
      {tab === "clients" && <Clients appData={appData} />}
      {tab === "workers" && <Workers appData={appData} />}
      {tab === "suppliers" && <Suppliers appData={appData} />}
      {tab === "general" && <General appData={appData} />}
      {tab === "zakat" && <Zakat appData={appData} />}
    </ScrollView>
  );
}
