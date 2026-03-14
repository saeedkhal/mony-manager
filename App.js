import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useState, useEffect, useMemo } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { getClients, getGeneralTxs } from "./utils/db";
import { useAppData } from "./hooks/useAppData";
import Header from "./components/Header";
import HeaderActions from "./components/HeaderActions";
import Drawer from "./components/Drawer";
import MainContent from "./screens/MainContent";
import Modals from "./components/Modals";
import GlobalSpinner from "./components/GlobalSpinner";
import { NAV_ITEMS } from "./constants";
import { getCurrentFiscalYear, getFiscalYearLabel } from "./utils/helpers";
import styles from "./styles/AppStyles";
import DrizzleStudio from "./components/DrizzleStudio";

I18nManager.forceRTL(true);
I18nManager.allowRTL(true);

function AppContent() {
  const insets = useSafeAreaInsets();
  const {
    loaded,
    tab,
    setTab,
    setSelectedClient,
    setSelectedWorker,
    setSelectedSupplier,
    showDrawer,
    setShowDrawer,
    closeDrawer,
    drawerAnimation,
    activeFY,
    showFYPicker,
    setShowFYPicker,
    handleFYChange,
    clientsVersion,
    generalTxsVersion,
    customFYs,
    dataLoadingCount,
  } = useApp();
  const [clients, setClients] = useState([]);
  const [generalTxs, setGeneralTxs] = useState([]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    Promise.all([getClients(), getGeneralTxs()])
      .then(([c, g]) => {
        if (!cancelled) {
          setClients(c || []);
          setGeneralTxs(g || []);
        }
      })
      .catch(() => {
        if (!cancelled) setClients([]);
        if (!cancelled) setGeneralTxs([]);
      });
    return () => { cancelled = true; };
  }, [loaded, clientsVersion, generalTxsVersion]);

  const { allFYs } = useAppData(clients, generalTxs, [], [], activeFY, customFYs);

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
          allFYs={allFYs}
          showFYPicker={showFYPicker}
          onToggleFYPicker={() => setShowFYPicker((p) => !p)}
          onFYChange={handleFYChange}
          getCurrentFiscalYear={getCurrentFiscalYear}
          getFiscalYearLabel={getFiscalYearLabel}
          headerActions={<HeaderActions />}
        />
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <MainContent />
        </ScrollView>
      </View>
      <View style={{ height: insets.bottom, backgroundColor: systemBarColor }} />
      <Drawer
        visible={showDrawer}
        onClose={closeDrawer}
        navItems={NAV_ITEMS}
        activeTab={tab}
        onTabChange={(k) => {
          setTab(k);
          setSelectedClient(null);
          setSelectedWorker(null);
          setSelectedSupplier(null);
        }}
        drawerAnimation={drawerAnimation}
        safeAreaBottom={insets.bottom}
      />
      <Modals />
      <GlobalSpinner visible={dataLoadingCount > 0} tip="جاري التحميل..." />
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
