import { I18nManager } from "react-native";
import { StatusBar } from "expo-status-bar";
import { View, Text, ScrollView } from "react-native";

import { AppProvider, useApp } from "./context/AppContext";
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
    allFYs,
    showFYPicker,
    setShowFYPicker,
    handleFYChange,
  } = useApp();

  if (!loaded) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <MainContent />
      </ScrollView>
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
