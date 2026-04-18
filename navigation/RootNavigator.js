import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Dashboard from "../screens/Dashboard";
import Clients from "../screens/Clients";
import Workers from "../screens/Workers";
import Suppliers from "../screens/Suppliers";
import General from "../screens/General";
import Zakat from "../screens/Zakat";
import FiscalYear from "../screens/FiscalYear";
import Backups from "../screens/Backups";

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerShown: false,
  animation: "fade",
  contentStyle: { backgroundColor: "#0f172a", flex: 1 },
};

export default function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="dashboard"
      screenOptions={screenOptions}
    >
      <Stack.Screen name="dashboard" component={Dashboard} />
      <Stack.Screen name="clients" component={Clients} />
      <Stack.Screen name="workers" component={Workers} />
      <Stack.Screen name="suppliers" component={Suppliers} />
      <Stack.Screen name="general" component={General} />
      <Stack.Screen name="zakat" component={Zakat} />
      <Stack.Screen name="fiscalyear" component={FiscalYear} />
      <Stack.Screen name="backups" component={Backups} />
    </Stack.Navigator>
  );
}
