import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { View, Text, I18nManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";

import { memo, useCallback, useRef, useState } from "react";
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

const SYSTEM_BAR_COLOR = "#f0f0f0";

const AppMain = memo(function AppMain({
  topInset,
  bottomInset,
  onMenuPress,
  activeFiscalYearLabel,
  onResetToCurrentFiscalYear,
  navigationRef,
  onNavStateChange,
}) {
  return (
    <>
      <View style={{ height: topInset, backgroundColor: SYSTEM_BAR_COLOR }} />
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" backgroundColor={SYSTEM_BAR_COLOR} />
        <Header
          onMenuPress={onMenuPress}
          title="مول عمولة"
          activeFiscalYearLabel={activeFiscalYearLabel}
          onResetToCurrentFiscalYear={onResetToCurrentFiscalYear}
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
      <View style={{ height: bottomInset, backgroundColor: SYSTEM_BAR_COLOR }} />
    </>
  );
});

function AppContent() {
  const insets = useSafeAreaInsets();
  const navigationRef = useRef(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showDrawer, setShowDrawer] = useState(false);
  const { loaded, activeFiscalYearLabel, handleFYChange } = useApp();

  const openDrawer = useCallback(() => setShowDrawer(true), []);
  const closeDrawer = useCallback(() => setShowDrawer(false), []);

  const navigateTo = useCallback((name) => {
    navigationRef.current?.navigate(name);
    setShowDrawer(false);
  }, []);

  const onNavStateChange = useCallback((state) => {
    if (!state) return;
    const route = state.routes[state.index];
    if (route?.name) setActiveTab(route.name === "clientStatement" ? "clients" : route.name);
  }, []);

  const onResetToCurrentFiscalYear = useCallback(async () => {
    const id = await ensureFiscalYearLabel(getCurrentFiscalYear());
    if (id != null) await handleFYChange(id, getCurrentFiscalYear());
  }, [handleFYChange]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <View style={{ height: insets.top, backgroundColor: SYSTEM_BAR_COLOR }} />
        <View style={[styles.container, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
        <View style={{ height: insets.bottom, backgroundColor: SYSTEM_BAR_COLOR }} />
        <StatusBar style="dark" backgroundColor={SYSTEM_BAR_COLOR} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppMain
        topInset={insets.top}
        bottomInset={insets.bottom}
        onMenuPress={openDrawer}
        activeFiscalYearLabel={activeFiscalYearLabel}
        onResetToCurrentFiscalYear={onResetToCurrentFiscalYear}
        navigationRef={navigationRef}
        onNavStateChange={onNavStateChange}
      />
      <Drawer
        visible={showDrawer}
        onClose={closeDrawer}
        navItems={NAV_ITEMS}
        activeTab={activeTab}
        onTabChange={navigateTo}
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
