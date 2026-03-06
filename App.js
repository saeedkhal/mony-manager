import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppProvider, useApp } from "./context/AppContext";
import { useAppData } from "./hooks/useAppData";
import Header from "./components/Header";
import HeaderActions from "./components/HeaderActions";
import Drawer from "./components/Drawer";
import MainContent from "./screens/MainContent";
import Modals from "./components/Modals";
import { NAV_ITEMS } from "./constants";
import { getCurrentFiscalYear, getFiscalYearLabel } from "./utils/helpers";
import styles from "./styles/AppStyles";

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
    clients,
    generalTxs,
    workers,
    suppliers,
  } = useApp();
  const { allFYs } = useAppData(clients, generalTxs, workers, suppliers, activeFY);

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
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
