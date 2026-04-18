import { I18nManager } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";

import { useRef, useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import Header from "./components/Header";
import Drawer from "./components/Drawer";
import RootNavigator from "./navigation/RootNavigator";
import { NAV_ITEMS } from "./constants";
import { getCurrentFiscalYear, getFiscalYearLabel } from "./utils/helpers";
import { ensureFiscalYearLabel } from "./utils/db";
import styles from "./styles/AppStyles";
import DrizzleStudio from "./components/DrizzleStudio";

WebBrowser.maybeCompleteAuthSession();

I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

function AppContent() {
  const insets = useSafeAreaInsets();
  const navigationRef = useRef(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const {
    loaded,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
    activeFiscalYearLabel,
    handleFYChange,
  } = useApp();

  const navigateTo = (name) => {
    navigationRef.current?.navigate(name);
  };

  const onNavStateChange = (state) => {
    if (!state) return;
    const route = state.routes[state.index];
    if (route?.name) setActiveTab(route.name);
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
          activeFiscalYearLabel={activeFiscalYearLabel}
          onResetToCurrentFiscalYear={async () => {
            const id = await ensureFiscalYearLabel(getCurrentFiscalYear());
            if (id != null) await handleFYChange(id, getCurrentFiscalYear());
          }}
          getCurrentFiscalYear={getCurrentFiscalYear}
          getFiscalYearLabel={getFiscalYearLabel}
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
        activeTab={activeTab}
        onTabChange={(k) => {
          navigateTo(k);
          closeDrawer();
        }}
        drawerAnimation={drawerAnimation}
        safeAreaBottom={insets.bottom}
      />
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
