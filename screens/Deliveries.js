import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, BackHandler } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { getDeliveryDatesPage } from "../utils/db";
import { STATUS_LABELS } from "../constants";
import { getDeliveryStatus } from "../utils/deliveryReminders";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";

const PAGE_SIZE = 5;

export default function Deliveries() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel } = useApp();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const listFetchGen = useRef(0);
  const menuBtnRefs = useRef({});
  const listRootRef = useRef(null);

  const pageCount = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [activeFiscalYearId]);

  const closeRowMenu = () => {
    setRowMenuId(null);
    setRowMenuPos(null);
  };

  useEffect(() => {
    if (rowMenuId == null) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeRowMenu();
      return true;
    });
    return () => sub.remove();
  }, [rowMenuId]);

  const openRowMenu = (client) => {
    if (!client) return;
    if (Number(rowMenuId) === Number(client.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[client.id];
    const root = listRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(client.id);
      setRowMenuPos({ x, y, w, h, client });
    };
    requestAnimationFrame(() => {
      if (!btn || typeof btn.measureInWindow !== "function") {
        place(12, 80, 32, 32);
        return;
      }
      if (root && typeof root.measureInWindow === "function") {
        root.measureInWindow((rx, ry) => {
          btn.measureInWindow((bx, by, bw, bh) => {
            place(bx - (rx || 0), by - (ry || 0), bw, bh);
          });
        });
        return;
      }
      btn.measureInWindow((x, y, w, h) => place(x, y, w, h));
    });
  };

  const openClient = (id) => {
    closeRowMenu();
    navigation.navigate("clients", { openClientId: id });
  };

  useEffect(() => {
    if (!loaded || !isFocused) return;
    listFetchGen.current += 1;
    const gen = listFetchGen.current;
    let cancelled = false;
    setLoading(true);
    closeRowMenu();
    getDeliveryDatesPage(PAGE_SIZE, page * PAGE_SIZE, activeFiscalYearId)
      .then(({ clients: rows, total: n }) => {
        if (cancelled || gen !== listFetchGen.current) return;
        const count = Number(n) || 0;
        const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
        if (page > maxPage) {
          setPage(maxPage);
          setTotal(count);
          return;
        }
        setClients(rows || []);
        setTotal(count);
      })
      .catch(() => {
        if (cancelled || gen !== listFetchGen.current) return;
        setClients([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled && gen === listFetchGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, activeFiscalYearId, page]);

  const rows = useMemo(
    () =>
      (clients || []).map((c) => ({
        client: c,
        status: getDeliveryStatus(c),
      })),
    [clients]
  );

  if (loading && clients.length === 0) {
    return (
      <ScreenLayout>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </ScreenLayout>
    );
  }

  return (
    <View ref={listRootRef} collapsable={false} style={{ flex: 1 }}>
      <ScreenLayout>
        <View style={styles.clientsView}>
          <Text style={styles.sectionSubtitle}>
            مواعيد التسليم — السنة المالية {activeFiscalYearLabel}
          </Text>
          {loading && clients.length > 0 ? (
            <View style={{ paddingVertical: 8, alignItems: "center" }}>
              <ActivityIndicator color="#f59e0b" />
            </View>
          ) : null}
          {clients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🚚</Text>
              <Text style={styles.emptyText}>لا توجد مواعيد تسليم في هذه السنة</Text>
            </View>
          ) : (
            <View style={styles.stockTableCard}>
              <View style={styles.stockTableHeader}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                    العميل
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                    الموعد
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                    الحالة
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                    {" "}
                  </Text>
                </View>
              </View>
              {rows.map((row, index) => {
                const { client: c, status: st } = row;
                const job = STATUS_LABELS[c.status] || STATUS_LABELS.active;
                const isLast = index === rows.length - 1;
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.stockTableRow,
                      index % 2 === 1 && styles.stockTableRowAlt,
                      isLast && pageCount <= 1 && styles.stockTableRowLast,
                    ]}
                  >
                    <View style={[styles.stockTableCol, styles.stockTableColName]}>
                      <Text style={styles.stockTableCellName} numberOfLines={2}>
                        {c.name}
                      </Text>
                      <Text style={styles.stockTableCellSub} numberOfLines={1}>
                        {c.project ? `${c.project} • ` : ""}
                        {job.label}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColPhone]}>
                      <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                        {st?.date || "—"}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMoney]}>
                      <Text
                        style={[
                          styles.stockTableCell,
                          styles.stockTableCellCenter,
                          { color: st?.color || "#94a3b8" },
                        ]}
                        numberOfLines={1}
                      >
                        {st?.label || "—"}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                      <View
                        collapsable={false}
                        ref={(el) => {
                          if (el) menuBtnRefs.current[c.id] = el;
                          else delete menuBtnRefs.current[c.id];
                        }}
                      >
                        <TouchableOpacity style={styles.stockMenuBtn} onPress={() => openRowMenu(c)}>
                          <Text style={styles.stockMenuBtnText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              {pageCount > 1 ? (
                <View style={styles.stockTablePager}>
                  <TouchableOpacity
                    style={[styles.stockTablePagerBtn, page === 0 && styles.stockTablePagerBtnDisabled]}
                    onPress={() => {
                      closeRowMenu();
                      setPage((p) => Math.max(0, p - 1));
                    }}
                    disabled={page === 0}
                  >
                    <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                  </TouchableOpacity>
                  <Text style={styles.stockTablePagerInfo}>
                    صفحة {page + 1} من {pageCount}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      page >= pageCount - 1 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => {
                      closeRowMenu();
                      setPage((p) => Math.min(pageCount - 1, p + 1));
                    }}
                    disabled={page >= pageCount - 1}
                  >
                    <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScreenLayout>
      {rowMenuPos?.client ? (
        <View style={rowMenuOverlayStyles.layer} pointerEvents="box-none">
          <Pressable style={rowMenuOverlayStyles.backdrop} onPress={closeRowMenu} />
          <View
            style={[
              styles.stockRowMenu,
              {
                top: rowMenuPos.y + rowMenuPos.h + 4,
                left: rowMenuPos.x,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => openClient(rowMenuPos.client.id)}
            >
              <Text style={styles.stockRowMenuItemText}>عرض العميل</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const rowMenuOverlayStyles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    direction: "ltr",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
});
