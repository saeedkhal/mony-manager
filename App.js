import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";

import { useState, useRef } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import Header from "./components/Header";
import HeaderActions from "./components/HeaderActions";
import Drawer from "./components/Drawer";
import RootNavigator from "./navigation/RootNavigator";
import Modals from "./components/Modals";
import { NAV_ITEMS } from "./constants";
import { getCurrentFiscalYear, getFiscalYearLabel } from "./utils/helpers";
import styles from "./styles/AppStyles";
import DrizzleStudio from "./components/DrizzleStudio";

I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

function AppContent() {
  const insets = useSafeAreaInsets();
  const navigationRef = useRef(null);
  const [currentRoute, setCurrentRoute] = useState("dashboard");
  const {
    loaded,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
    activeFY,
    handleFYChange,
  } = useApp();

  const onNavStateChange = (state) => {
    if (!state) return;
    const route = state.routes[state.index];
    if (route?.name) setCurrentRoute(route.name);
  };

  const navigateTo = (name) => {
    navigationRef.current?.navigate(name);
  };

  const systemBarColor = "#f0f0f0";

  if (!loaded) {
    return (
      <View style={styles.container}>
        <View style={{ height: insets.top, backgroundColor: systemBarColor }} />
        <View style={[styles.container, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        <View style={{ height: insets.bottom, backgroundColor: systemBarColor }} />
        <StatusBar style="dark" backgroundColor={systemBarColor} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ height: insets.top, backgroundColor: systemBarColor }} />
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" backgroundColor={systemBarColor} />
        <Header
          onMenuPress={() => setShowDrawer(true)}
          title="🏪 مول عموله"
          activeFY={activeFY}
          onFYChange={handleFYChange}
          getCurrentFiscalYear={getCurrentFiscalYear}
          getFiscalYearLabel={getFiscalYearLabel}
          headerActions={<HeaderActions currentRoute={currentRoute} />}
        />
        <NavigationContainer
          ref={navigationRef}
          onStateChange={onNavStateChange}
          style={{ flex: 1 }}
        >
          <RootNavigator />
        </NavigationContainer>
      </View>
      <View style={{ height: insets.bottom, backgroundColor: systemBarColor }} />
      <Drawer
        visible={showDrawer}
        onClose={closeDrawer}
        navItems={NAV_ITEMS}
        activeTab={currentRoute}
        onTabChange={(k) => {
          navigateTo(k);
          closeDrawer();
        }}
        drawerAnimation={drawerAnimation}
        safeAreaBottom={insets.bottom}
      />
      <Modals />
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <DrizzleStudio />
      <AppContent />
    </AppProvider>
  );
}
