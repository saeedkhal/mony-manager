import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Pressable, StyleSheet, BackHandler } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import {
  getStockItemsWithBalance,
  getStockMovementsPage,
  getSuppliers,
  getClientNamesByIds,
  recordStockPurchase,
  recordStockIssue,
  updateStockMovement,
  upsertStockItem,
  deleteStockMovement,
} from "../utils/db";
import { CURRENCY, STOCK_UNITS } from "../constants";
import { fmt } from "../utils/helpers";
import { getStockUnitLabel } from "../utils/stockHelpers";
import {
  FORM_MSG,
  parsePositiveAmount,
  isValidDateYmd,
  trimmed,
} from "../utils/formValidation";
import styles from "../styles/AppStyles";
import ScreenLayout from "../components/ScreenLayout";
import CustomModal from "../components/Modal";
import FormDateField from "../components/FormDateField";
import FormTextInput from "../components/FormTextInput";
import ClientSearchSelect from "../components/ClientSearchSelect";

const STOCK_MOVEMENTS_PAGE_SIZE = 5;
const STOCK_ITEMS_PAGE_SIZE = 5;

export default function Warehouse() {
  const { loaded, activeFiscalYearId, activeFiscalYearLabel, modal, setModal, setForm, form } = useApp();
  const isFocused = useIsFocused();
  const [formErrors, setFormErrors] = useState({});
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [clientNames, setClientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [filterItemId, setFilterItemId] = useState(null);
  const [stockPage, setStockPage] = useState(0);
  const [rowMenuId, setRowMenuId] = useState(null);
  const [rowMenuPos, setRowMenuPos] = useState(null);
  const menuBtnRefs = useRef({});
  const warehouseRootRef = useRef(null);
  const [detailMovements, setDetailMovements] = useState([]);
  const [detailMovementsLoading, setDetailMovementsLoading] = useState(false);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [movementsLoadingMore, setMovementsLoadingMore] = useState(false);
  const movementsRef = useRef([]);
  const filterItemIdRef = useRef(null);
  const skipFilterReload = useRef(true);

  useEffect(() => {
    movementsRef.current = movements;
  }, [movements]);

  useEffect(() => {
    filterItemIdRef.current = filterItemId;
  }, [filterItemId]);

  const loadMovementsFirstPage = useCallback(async () => {
    if (activeFiscalYearId == null) {
      setMovements([]);
      setMovementsHasMore(false);
      return;
    }
    const { movements: first, hasMore } = await getStockMovementsPage(
      activeFiscalYearId,
      STOCK_MOVEMENTS_PAGE_SIZE,
      0,
      filterItemIdRef.current
    );
    setMovements(first || []);
    setMovementsHasMore(!!hasMore);
  }, [activeFiscalYearId]);

  const refetch = useCallback(async () => {
    if (!loaded) return;
    const [bal, sup] = await Promise.all([
      getStockItemsWithBalance(),
      getSuppliers(),
    ]);
    setBalances(bal || []);
    setSuppliers(sup || []);
    await loadMovementsFirstPage();
  }, [loaded, loadMovementsFirstPage]);

  const loadMoreMovements = useCallback(async () => {
    if (!movementsHasMore || movementsLoadingMore || loading || activeFiscalYearId == null) return;
    setMovementsLoadingMore(true);
    try {
      const offset = movementsRef.current.length;
      const { movements: next, hasMore } = await getStockMovementsPage(
        activeFiscalYearId,
        STOCK_MOVEMENTS_PAGE_SIZE,
        offset,
        filterItemIdRef.current
      );
      setMovements((prev) => [...prev, ...(next || [])]);
      setMovementsHasMore(!!hasMore);
    } catch (_) {
      setMovementsHasMore(false);
    } finally {
      setMovementsLoadingMore(false);
    }
  }, [movementsHasMore, movementsLoadingMore, loading, activeFiscalYearId]);

  const onScrollWarehouse = useCallback(
    (e) => {
      setRowMenuId(null);
      setRowMenuPos(null);
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const threshold = 120;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold) {
        loadMoreMovements();
      }
    },
    [loadMoreMovements]
  );

  useEffect(() => {
    if (!loaded || !isFocused) return;
    let cancelled = false;
    setLoading(true);
    refetch()
      .catch(() => {
        if (!cancelled) {
          setBalances([]);
          setMovements([]);
          setMovementsHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, isFocused, refetch]);

  useEffect(() => {
    if (skipFilterReload.current) {
      skipFilterReload.current = false;
      return;
    }
    loadMovementsFirstPage().catch(() => {
      setMovements([]);
      setMovementsHasMore(false);
    });
    // Reload the list only when the user taps an item; initial load is handled by refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterItemId]);

  useEffect(() => {
    if (modal !== "stockItemDetail" || form.itemId == null || activeFiscalYearId == null) {
      setDetailMovements([]);
      return undefined;
    }
    let cancelled = false;
    setDetailMovementsLoading(true);
    getStockMovementsPage(activeFiscalYearId, 40, 0, form.itemId)
      .then(({ movements: list }) => {
        if (!cancelled) setDetailMovements(list || []);
      })
      .catch(() => {
        if (!cancelled) setDetailMovements([]);
      })
      .finally(() => {
        if (!cancelled) setDetailMovementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modal, form.itemId, activeFiscalYearId]);

  useEffect(() => {
    const ids = [
      ...movements.map((m) => m.clientId),
      ...detailMovements.map((m) => m.clientId),
    ].filter((id) => id != null);
    if (!ids.length) return undefined;
    let cancelled = false;
    getClientNamesByIds(ids)
      .then((map) => {
        if (cancelled || !map || !Object.keys(map).length) return;
        setClientNames((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [movements, detailMovements]);

  const itemMap = useMemo(() => {
    const m = {};
    for (const b of balances) m[b.item.id] = b;
    return m;
  }, [balances]);

  const getSupplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const getClientName = (id) => {
    if (id == null) return "—";
    return clientNames[id] || clientNames[String(id)] || "—";
  };

  const selectedSupplierLabel = useMemo(() => {
    if (!form.supplierId) return "-- اختر المورد --";
    const s = suppliers.find((x) => x.id === form.supplierId);
    if (!s) return "-- اختر المورد --";
    return s.category ? `${s.name} (${s.category})` : s.name;
  }, [form.supplierId, suppliers]);

  const selectedItemLabel = useMemo(() => {
    if (!form.itemId) return "-- اختر الصنف --";
    const b = balances.find((x) => x.item.id === form.itemId);
    if (!b) return "-- اختر الصنف --";
    const unit = getStockUnitLabel(b.item.unit);
    return `${b.item.name} — رصيد ${fmt(b.quantity)} ${unit}`;
  }, [form.itemId, balances]);

  const filteredItemBalance = useMemo(
    () => (filterItemId != null ? itemMap[filterItemId] : null),
    [filterItemId, itemMap]
  );

  const detailBalance = useMemo(() => {
    if (form.itemId == null) return null;
    return (
      itemMap[form.itemId] ||
      balances.find((x) => Number(x.item.id) === Number(form.itemId)) ||
      null
    );
  }, [form.itemId, itemMap, balances]);

  const stockPageCount = Math.max(1, Math.ceil(balances.length / STOCK_ITEMS_PAGE_SIZE));
  const pagedBalances = useMemo(
    () =>
      balances.slice(
        stockPage * STOCK_ITEMS_PAGE_SIZE,
        stockPage * STOCK_ITEMS_PAGE_SIZE + STOCK_ITEMS_PAGE_SIZE
      ),
    [balances, stockPage]
  );

  useEffect(() => {
    if (stockPage > stockPageCount - 1) {
      setStockPage(Math.max(0, stockPageCount - 1));
    }
  }, [stockPage, stockPageCount]);

  const issuePreviewAmount = useMemo(() => {
    if (modal !== "stockIssue" || !form.itemId) return null;
    const qty = parsePositiveAmount(form.quantity);
    if (qty == null) return null;
    const b = balances.find((x) => Number(x.item.id) === Number(form.itemId));
    if (!b) return null;
    const extraQty = form.editMovementId != null ? Number(form.editMovementQty) || 0 : 0;
    const extraVal = extraQty * (Number(form.editMovementUnitPrice) || 0);
    const available = b.quantity + extraQty;
    if (qty > available) return null;
    const restoredQty = b.quantity + extraQty;
    const restoredCost = (b.totalValue || 0) + extraVal;
    const avg = restoredQty > 0 ? restoredCost / restoredQty : 0;
    return qty * avg;
  }, [modal, form.itemId, form.quantity, form.editMovementId, form.editMovementQty, form.editMovementUnitPrice, balances]);

  const closePickers = () => {
    setShowSupplierPicker(false);
  };

  const openItemDetail = (itemId) => {
    setForm({ stockModal: "detail", itemId });
    setModal("stockItemDetail");
  };

  const openPurchase = async (itemId) => {
    const id = itemId ?? form.itemId;
    setFormErrors({});
    closePickers();
    let supList = suppliers;
    try {
      supList = await getSuppliers();
      setSuppliers(supList || []);
    } catch (_) {
      supList = [];
    }
    const b = balances.find((x) => Number(x.item.id) === Number(id));
    const defaultPrice =
      Number(b?.item?.unitPrice) > 0 ? b.item.unitPrice : b?.avgCost > 0 ? b.avgCost : "";
    setForm({
      stockModal: "purchase",
      itemId: id,
      supplierId: supList?.[0]?.id ?? null,
      unitPrice: defaultPrice !== "" ? String(defaultPrice) : "",
      date: new Date().toISOString().split("T")[0],
      returnToDetail: true,
    });
    setModal("stockPurchase");
  };

  const openIssue = async (itemId) => {
    const id = itemId ?? form.itemId;
    setFormErrors({});
    closePickers();
    setForm({
      stockModal: "issue",
      itemId: id,
      clientId: null,
      clientName: "",
      quantity: "",
      date: new Date().toISOString().split("T")[0],
      returnToDetail: true,
    });
    setModal("stockIssue");
  };

  const returnToItemDetail = (itemId) => {
    setFormErrors({});
    closePickers();
    const id = itemId ?? form.itemId;
    if (id != null) {
      setForm({ stockModal: "detail", itemId: id });
      setModal("stockItemDetail");
      return;
    }
    setModal(null);
    setForm({});
  };

  const closeMovementForm = () => {
    setFormErrors({});
    closePickers();
    if (form.returnToDetail && form.itemId != null) {
      returnToItemDetail(form.itemId);
      return;
    }
    setModal(null);
    setForm({});
  };

  const reloadDetailMovements = async (itemId) => {
    if (itemId == null || activeFiscalYearId == null) return;
    try {
      const { movements: list } = await getStockMovementsPage(
        activeFiscalYearId,
        40,
        0,
        itemId
      );
      setDetailMovements(list || []);
    } catch (_) {
      setDetailMovements([]);
    }
  };

  const openEditMovement = (m, fromDetail = false) => {
    if (!m) return;
    setFormErrors({});
    closePickers();
    const clientName = getClientName(m.clientId);
    if (m.direction === "in") {
      setForm({
        stockModal: "purchase",
        editMovementId: m.id,
        itemId: m.itemId,
        supplierId: m.supplierId,
        quantity: String(m.quantity ?? ""),
        unitPrice: String(m.unitPrice ?? ""),
        date: m.date,
        note: m.note || "",
        editMovementQty: m.quantity,
        returnToDetail: !!fromDetail,
      });
      setModal("stockPurchase");
      return;
    }
    setForm({
      stockModal: "issue",
      editMovementId: m.id,
      itemId: m.itemId,
      clientId: m.clientId,
      clientName: clientName === "—" ? "" : clientName,
      quantity: String(m.quantity ?? ""),
      date: m.date,
      note: m.note || "",
      editMovementQty: m.quantity,
      editMovementUnitPrice: m.unitPrice,
      returnToDetail: !!fromDetail,
    });
    setModal("stockIssue");
  };

  const openAddItem = () => {
    setFormErrors({});
    setForm({
      stockModal: "item",
      itemName: "",
      itemUnit: STOCK_UNITS[0].id,
      itemUnitPrice: "",
    });
    setModal("stockItem");
  };

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

  const openRowMenu = (item) => {
    if (!item) return;
    if (Number(rowMenuId) === Number(item.id)) {
      closeRowMenu();
      return;
    }
    const btn = menuBtnRefs.current[item.id];
    const root = warehouseRootRef.current;
    const place = (x, y, w, h) => {
      setRowMenuId(item.id);
      setRowMenuPos({ x, y, w, h, item });
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

  const openEditItem = (item, fromDetail = false) => {
    if (!item) return;
    setFormErrors({});
    const b = balances.find((x) => Number(x.item.id) === Number(item.id));
    const price =
      Number(item.unitPrice) > 0 ? item.unitPrice : b?.avgCost > 0 ? b.avgCost : "";
    setForm({
      stockModal: "item",
      editId: item.id,
      itemId: item.id,
      itemName: item.name,
      itemUnit: item.unit || STOCK_UNITS[0].id,
      itemExpenseCat: item.expenseCat || "أخرى",
      itemUnitPrice: price !== "" ? String(price) : "",
      returnToDetail: !!fromDetail,
    });
    setModal("stockItem");
  };

  const closeStockItemForm = () => {
    setFormErrors({});
    if (form.returnToDetail && form.editId) {
      returnToItemDetail(form.editId);
      return;
    }
    setModal(null);
    setForm({});
  };

  const savePurchase = async () => {
    const err = {};
    const qty = parsePositiveAmount(form.quantity);
    const price = parsePositiveAmount(form.unitPrice);
    if (qty == null) err.quantity = FORM_MSG.amount;
    if (price == null) err.unitPrice = FORM_MSG.amount;
    if (!form.itemId) err.itemId = FORM_MSG.chooseItem;
    if (!form.supplierId) {
      err.supplierId =
        suppliers.length > 0 ? FORM_MSG.supplier : "أضف مورداً من شاشة «الموردين» ثم اختره من القائمة";
    }
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    try {
      if (form.editMovementId) {
        const b = balances.find((x) => Number(x.item.id) === Number(form.itemId));
        const oldQty = Number(form.editMovementQty) || 0;
        if (b && qty != null && b.quantity - oldQty + qty < -1e-9) {
          setFormErrors({ quantity: FORM_MSG.purchaseBelowIssued });
          return;
        }
        await updateStockMovement({
          movementId: form.editMovementId,
          quantity: qty,
          unitPrice: price,
          supplierId: form.supplierId,
          date,
          note: form.note || "",
        });
      } else {
        await recordStockPurchase({
          itemId: form.itemId,
          supplierId: form.supplierId,
          quantity: qty,
          unitPrice: price,
          date,
          note: form.note || "",
          fiscalYearId: activeFiscalYearId,
        });
      }
      await refetch();
      const itemId = form.itemId;
      closeMovementForm();
      await reloadDetailMovements(itemId);
    } catch (e) {
      if (e?.message === "WOULD_GO_NEGATIVE") {
        setFormErrors({ quantity: FORM_MSG.purchaseBelowIssued });
      } else {
        setFormErrors({ submit: "تعذر حفظ الشراء" });
      }
    }
  };

  const saveIssue = async () => {
    const err = {};
    const qty = parsePositiveAmount(form.quantity);
    if (qty == null) err.quantity = FORM_MSG.amount;
    if (!form.itemId) err.itemId = FORM_MSG.chooseItem;
    if (!form.clientId) err.clientId = FORM_MSG.client;
    const date = trimmed(form.date) || new Date().toISOString().split("T")[0];
    if (!isValidDateYmd(date)) err.date = FORM_MSG.date;
    const b = balances.find((x) => Number(x.item.id) === Number(form.itemId));
    const extraQty = form.editMovementId != null ? Number(form.editMovementQty) || 0 : 0;
    const overQty = b && qty != null && qty > b.quantity + extraQty;
    if (overQty) err.quantity = FORM_MSG.insufficientStock;
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    try {
      if (form.editMovementId) {
        await updateStockMovement({
          movementId: form.editMovementId,
          quantity: qty,
          clientId: form.clientId,
          date,
          note: form.note || "",
        });
      } else {
        await recordStockIssue({
          itemId: form.itemId,
          clientId: form.clientId,
          quantity: qty,
          date,
          note: form.note || "",
          fiscalYearId: activeFiscalYearId,
        });
      }
      await refetch();
      const itemId = form.itemId;
      closePickers();
      closeMovementForm();
      await reloadDetailMovements(itemId);
    } catch (e) {
      if (e?.message === "INSUFFICIENT_STOCK") {
        err.quantity = FORM_MSG.insufficientStock;
        setFormErrors(err);
      } else {
        setFormErrors({ submit: "تعذر الصرف من المخزن" });
      }
    }
  };

  const saveItem = async () => {
    const name = trimmed(form.itemName);
    if (!name) {
      setFormErrors({ itemName: "أدخل اسم الصنف" });
      return;
    }
    const priceRaw = trimmed(form.itemUnitPrice);
    let unitPrice = null;
    if (priceRaw) {
      unitPrice = parsePositiveAmount(priceRaw);
      if (unitPrice == null) {
        setFormErrors({ itemUnitPrice: FORM_MSG.amount });
        return;
      }
    }
    try {
      await upsertStockItem({
        id: form.editId,
        name,
        unit: form.itemUnit || "count",
        expenseCat: form.itemExpenseCat || "أخرى",
        unitPrice,
      });
      await refetch();
      if (form.returnToDetail && form.editId) {
        returnToItemDetail(form.editId);
      } else {
        setModal(null);
        setForm({});
      }
    } catch (_) {
      setFormErrors({ submit: "تعذر الحفظ" });
    }
  };

  const handleDeleteMovement = async (movId) => {
    try {
      await deleteStockMovement(movId);
      await refetch();
      if (modal === "stockItemDetail" && form.itemId != null) {
        await reloadDetailMovements(form.itemId);
      }
    } catch (_) {}
  };

  const totalInventoryValue = balances.reduce((s, b) => s + (b.totalValue || 0), 0);

  if (loading) {
    return (
      <ScreenLayout>
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </ScreenLayout>
    );
  }

  return (
    <View ref={warehouseRootRef} collapsable={false} style={{ flex: 1 }}>
      <ScreenLayout scrollViewProps={{ onScroll: onScrollWarehouse, scrollEventThrottle: 400 }}>
        <View style={styles.dashboard}>
          <Text style={styles.cardTitle}>📦 المخزن — {activeFiscalYearLabel}</Text>

          <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>
            اضغط «عرض» لفتح صفحة الصنف والشراء أو الصرف. يمكن الصرف أيضاً من صفحة العميل → «من المخزن».
          </Text>
          <TouchableOpacity style={[styles.btn, { marginBottom: 16, backgroundColor: "rgba(148,163,184,0.2)" }]} onPress={openAddItem}>
            <Text style={styles.btnText}>+ صنف جديد</Text>
          </TouchableOpacity>

          <Text style={[styles.cardTitle, { fontSize: 16, marginBottom: 8 }]}>الأصناف والرصيد</Text>
          {balances.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>لا توجد أصناف — أضف صنفاً أو سجّل شراء</Text>
            </View>
          ) : (
            <View style={styles.stockTableCard}>
              <View style={styles.stockTableHeader}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableHeaderText} numberOfLines={1}>
                    الصنف
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColQty]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={2}>
                    الرصيد
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={2}>
                    المتبقي
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColCost]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={2}>
                    سعر الوحدة
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={2}>
                    القيمة
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                  <Text style={[styles.stockTableHeaderText, styles.stockTableHeaderTextCenter]} numberOfLines={1}>
                    {" "}
                  </Text>
                </View>
              </View>
              {pagedBalances.map((b, index) => {
                const unitLabel = getStockUnitLabel(b.item.unit);
                const isLast = index === pagedBalances.length - 1;
                const remaining = b.quantity || 0;
                const received = b.received != null ? b.received : remaining;
                return (
                  <View
                    key={b.item.id}
                    style={[
                      styles.stockTableRow,
                      index % 2 === 1 && styles.stockTableRowAlt,
                      isLast && styles.stockTableRowLast,
                    ]}
                  >
                    <View style={[styles.stockTableCol, styles.stockTableColName]}>
                      <Text style={styles.stockTableCellName} numberOfLines={2}>
                        {b.item.name}
                        {unitLabel ? (
                          <Text style={styles.stockTableCellNameUnit}> ({unitLabel})</Text>
                        ) : null}
                      </Text>
                      {remaining <= 0 ? (
                        <Text style={[styles.stockTableCellSub, { color: "#f43f5e" }]}>نفد الرصيد</Text>
                      ) : null}
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColQty]}>
                      <Text style={[styles.stockTableCell, styles.stockTableCellCenter]}>
                        {fmt(received)}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColRemain]}>
                      <Text
                        style={[
                          styles.stockTableCell,
                          styles.stockTableCellCenter,
                          remaining <= 0 && { color: "#f43f5e" },
                        ]}
                      >
                        {fmt(remaining)}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColCost]}>
                      <Text style={[styles.stockTableCell, styles.stockTableCellCenter]} numberOfLines={1}>
                        {remaining <= 0 ? "—" : fmt(b.avgCost)}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                      <Text
                        style={[styles.stockTableCell, styles.stockTableCellCenter, { color: "#818cf8" }]}
                        numberOfLines={1}
                      >
                        {remaining <= 0 ? "—" : fmt(b.totalValue)}
                      </Text>
                    </View>
                    <View style={[styles.stockTableCol, styles.stockTableColMenu]}>
                      <View
                        collapsable={false}
                        ref={(el) => {
                          if (el) menuBtnRefs.current[b.item.id] = el;
                          else delete menuBtnRefs.current[b.item.id];
                        }}
                      >
                        <TouchableOpacity
                          style={styles.stockMenuBtn}
                          onPress={() => openRowMenu(b.item)}
                        >
                          <Text style={styles.stockMenuBtnText}>⋮</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={styles.stockTableFooter}>
                <View style={[styles.stockTableCol, styles.stockTableColName]}>
                  <Text style={styles.stockTableFooterText}>الإجمالي ({balances.length} صنف)</Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColQty]} />
                <View style={[styles.stockTableCol, styles.stockTableColRemain]} />
                <View style={[styles.stockTableCol, styles.stockTableColCost]} />
                <View style={[styles.stockTableCol, styles.stockTableColValue]}>
                  <Text
                    style={[
                      styles.stockTableCell,
                      styles.stockTableCellCenter,
                      { color: "#818cf8", fontWeight: "800" },
                    ]}
                    numberOfLines={1}
                  >
                    {fmt(totalInventoryValue)} {CURRENCY}
                  </Text>
                </View>
                <View style={[styles.stockTableCol, styles.stockTableColMenu]} />
              </View>
              {stockPageCount > 1 ? (
                <View style={styles.stockTablePager}>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      stockPage === 0 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => {
                      closeRowMenu();
                      setStockPage((p) => Math.max(0, p - 1));
                    }}
                    disabled={stockPage === 0}
                  >
                    <Text style={styles.stockTablePagerBtnText}>السابق</Text>
                  </TouchableOpacity>
                  <Text style={styles.stockTablePagerInfo}>
                    صفحة {stockPage + 1} من {stockPageCount}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.stockTablePagerBtn,
                      stockPage >= stockPageCount - 1 && styles.stockTablePagerBtnDisabled,
                    ]}
                    onPress={() => {
                      closeRowMenu();
                      setStockPage((p) => Math.min(stockPageCount - 1, p + 1));
                    }}
                    disabled={stockPage >= stockPageCount - 1}
                  >
                    <Text style={styles.stockTablePagerBtnText}>التالي</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          <Text style={[styles.cardTitle, { fontSize: 16, marginTop: 16, marginBottom: 8 }]}>
            {filteredItemBalance
              ? `حركات: ${filteredItemBalance.item.name}`
              : "آخر الحركات (السنة المالية)"}
          </Text>
          {filteredItemBalance ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
                gap: 8,
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13, flex: 1 }}>
                المتبقي: {fmt(filteredItemBalance.quantity)}{" "}
                {getStockUnitLabel(filteredItemBalance.item.unit)}
              </Text>
              <TouchableOpacity onPress={() => setFilterItemId(null)}>
                <Text style={{ color: "#818cf8", fontWeight: "700", fontSize: 13 }}>إلغاء التصفية</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {movements.length === 0 ? (
            <Text style={styles.emptyText}>
              {filteredItemBalance ? "لا حركات لهذا الصنف في السنة المالية" : "لا حركات بعد"}
            </Text>
          ) : (
            movements.map((m) => {
              const item = itemMap[m.itemId]?.item;
              const isIn = m.direction === "in";
              const partyLabel = isIn
                ? `المصدر: ${getSupplierName(m.supplierId)}`
                : `اسم العميل: ${getClientName(m.clientId)}`;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.txItemStack,
                    {
                      borderColor: isIn ? "rgba(16,185,129,0.3)" : "rgba(251,146,60,0.3)",
                      marginBottom: 8,
                    },
                  ]}
                >
                  <View style={styles.txItemRow}>
                    <Text style={styles.txIcon}>{isIn ? "📥" : "📤"}</Text>
                    <Text style={{ color: "#e2e8f0", fontWeight: "600", flex: 1 }}>
                      {item?.name || "صنف"}
                    </Text>
                    <Text style={styles.txDate}>{m.date}</Text>
                  </View>
                  <Text style={{ color: "#94a3b8", marginTop: 4 }}>
                    {isIn ? "دخول (شراء)" : "خروج (صرف)"}: {fmt(m.quantity, 2)}{" "}
                    {getStockUnitLabel(item?.unit)} × {fmt(m.unitPrice, 2)} = {fmt(m.quantity * m.unitPrice)}{" "}
                    {CURRENCY}
                  </Text>
                  <Text style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>{partyLabel}</Text>
                  {m.note ? (
                    <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{m.note}</Text>
                  ) : null}
                  <View style={[styles.txItemButtons, { marginTop: 8 }]}>
                    <TouchableOpacity style={styles.txEditBtn} onPress={() => openEditMovement(m, false)}>
                      <Text style={styles.txEditBtnText}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.txDeleteBtn} onPress={() => handleDeleteMovement(m.id)}>
                      <Text style={styles.txDeleteBtnText}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
          {movements.length > 0 && movementsLoadingMore ? (
            <ActivityIndicator color="#818cf8" style={{ marginVertical: 16 }} />
          ) : null}
          {movements.length > 0 && !movementsHasMore && !movementsLoadingMore ? (
            <Text style={[styles.emptyText, { marginTop: 8, fontSize: 12 }]}>— نهاية الحركات —</Text>
          ) : null}
        </View>
      </ScreenLayout>

      <CustomModal
        visible={modal === "stockPurchase"}
        onClose={closeMovementForm}
      >
        <Text style={styles.modalTitle}>
          {form.editMovementId ? "✏️ تعديل شراء" : "📥 شراء للمخزن"}
        </Text>
        <View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>🏭 المورد</Text>
            {suppliers.length === 0 ? (
              <Text style={{ color: "#94a3b8", marginBottom: 8 }}>
                لا يوجد موردون مسجّلون. أضف مورداً من تبويب «الموردين» في القائمة أولاً.
              </Text>
            ) : (
              <View style={styles.pickerContainer}>
                <TouchableOpacity
                  style={[
                    styles.pickerBtn,
                    formErrors.supplierId ? styles.inputError : null,
                  ]}
                  onPress={() => {
                    setShowSupplierPicker((p) => !p);
                  }}
                >
                  <Text
                    style={[styles.pickerBtnText, form.supplierId && { color: "#a78bfa" }]}
                    numberOfLines={1}
                  >
                    {selectedSupplierLabel}
                  </Text>
                  <Text style={styles.pickerBtnArrow}>▾</Text>
                </TouchableOpacity>
                {showSupplierPicker && (
                  <View style={styles.pickerDropdown}>
                    <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      <TouchableOpacity
                        style={[styles.pickerItem, !form.supplierId && styles.pickerItemActive]}
                        onPress={() => {
                          setFormErrors((e) => ({ ...e, supplierId: undefined }));
                          setForm((p) => ({ ...p, supplierId: null }));
                          setShowSupplierPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            !form.supplierId && styles.pickerItemTextActive,
                          ]}
                        >
                          -- اختر المورد --
                        </Text>
                      </TouchableOpacity>
                      {suppliers.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.pickerItem, form.supplierId === s.id && styles.pickerItemActive]}
                          onPress={() => {
                            setFormErrors((e) => ({ ...e, supplierId: undefined }));
                            setForm((p) => ({ ...p, supplierId: s.id }));
                            setShowSupplierPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              form.supplierId === s.id && styles.pickerItemTextActive,
                            ]}
                          >
                            {s.name}
                            {s.category ? ` (${s.category})` : ""}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
            {formErrors.supplierId ? <Text style={styles.fieldErrorText}>{formErrors.supplierId}</Text> : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الصنف</Text>
            <Text style={[styles.pickerBtnText, { color: "#818cf8" }]} numberOfLines={2}>
              {selectedItemLabel}
            </Text>
            {formErrors.itemId ? <Text style={styles.fieldErrorText}>{formErrors.itemId}</Text> : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الكمية</Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              value={form.quantity?.toString() || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, quantity: t }))}
              keyboardType="numeric"
              error={formErrors.quantity}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>سعر الوحدة ({CURRENCY})</Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              value={form.unitPrice?.toString() || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, unitPrice: t }))}
              keyboardType="numeric"
              error={formErrors.unitPrice}
            />
          </View>
          <FormDateField
            styles={styles}
            value={form.date}
            onChangeValue={(v) => setForm((p) => ({ ...p, date: v }))}
            active={modal === "stockPurchase"}
            error={formErrors.date}
          />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة</Text>
            <FormTextInput
              styles={styles}
              value={form.note || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, note: t }))}
            />
          </View>
        </View>
        {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
        <TouchableOpacity style={[styles.btn, styles.btnIncome, styles.modalSaveBtn]} onPress={savePurchase}>
          <Text style={styles.btnText}>{form.editMovementId ? "حفظ التعديل ✓" : "حفظ الشراء ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "stockIssue"}
        onClose={closeMovementForm}
      >
        <Text style={styles.modalTitle}>
          {form.editMovementId ? "✏️ تعديل صرف" : "📤 صرف لعميل"}
        </Text>
        <View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>👤 العميل</Text>
            <ClientSearchSelect
              styles={styles}
              value={form.clientId}
              selectedLabel={form.clientName || ""}
              error={formErrors.clientId}
              active={modal === "stockIssue"}
              onChange={(c) => {
                setFormErrors((e) => ({ ...e, clientId: undefined }));
                setForm((p) => ({
                  ...p,
                  clientId: c?.id ?? null,
                  clientName: c?.name ?? "",
                }));
                if (c?.id != null) {
                  setClientNames((prev) => ({ ...prev, [c.id]: c.name || "" }));
                }
              }}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>الصنف</Text>
            <Text style={[styles.pickerBtnText, { color: "#818cf8" }]} numberOfLines={2}>
              {selectedItemLabel}
            </Text>
            {formErrors.itemId ? <Text style={styles.fieldErrorText}>{formErrors.itemId}</Text> : null}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              الكمية
              {form.itemId
                ? ` (${getStockUnitLabel(
                    balances.find((b) => b.item.id === form.itemId)?.item?.unit
                  )})`
                : ""}
            </Text>
            <FormTextInput
              styles={styles}
              placeholder="0"
              value={form.quantity?.toString() || ""}
              onChangeText={(t) => {
                setFormErrors((e) => ({ ...e, quantity: undefined }));
                setForm((p) => ({ ...p, quantity: t }));
              }}
              keyboardType="numeric"
              error={formErrors.quantity}
            />
          </View>
          {issuePreviewAmount != null && (
            <Text style={{ color: "#fb923c", textAlign: "center", marginBottom: 12 }}>
              المبلغ على العميل (متوسط التكلفة): {fmt(issuePreviewAmount)} {CURRENCY}
            </Text>
          )}
          <FormDateField
            styles={styles}
            value={form.date}
            onChangeValue={(v) => setForm((p) => ({ ...p, date: v }))}
            active={modal === "stockIssue"}
            error={formErrors.date}
          />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ملاحظة</Text>
            <FormTextInput
              styles={styles}
              value={form.note || ""}
              onChangeText={(t) => setForm((p) => ({ ...p, note: t }))}
            />
          </View>
        </View>
        {formErrors.submit ? <Text style={styles.fieldErrorText}>{formErrors.submit}</Text> : null}
        <TouchableOpacity style={[styles.btn, styles.btnExpense, styles.modalSaveBtn]} onPress={saveIssue}>
          <Text style={styles.btnText}>{form.editMovementId ? "حفظ التعديل ✓" : "حفظ الصرف ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "stockItem"}
        onClose={closeStockItemForm}
      >
        <Text style={styles.modalTitle}>{form.editId ? "تعديل الصنف" : "صنف جديد"}</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>اسم الصنف</Text>
          <FormTextInput
            styles={styles}
            value={form.itemName || ""}
            onChangeText={(t) => setForm((p) => ({ ...p, itemName: t }))}
            error={formErrors.itemName}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>وحدة القياس</Text>
          <View style={styles.optionsGrid}>
            {STOCK_UNITS.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[styles.optionBtn, form.itemUnit === u.id && styles.optionBtnActive]}
                onPress={() => setForm((p) => ({ ...p, itemUnit: u.id }))}
              >
                <Text style={[styles.optionBtnText, form.itemUnit === u.id && styles.optionBtnTextActive]}>
                  {u.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>سعر الوحدة ({CURRENCY})</Text>
          <FormTextInput
            styles={styles}
            placeholder="0"
            value={form.itemUnitPrice?.toString() || ""}
            onChangeText={(t) => {
              setFormErrors((e) => ({ ...e, itemUnitPrice: undefined }));
              setForm((p) => ({ ...p, itemUnitPrice: t }));
            }}
            keyboardType="numeric"
            error={formErrors.itemUnitPrice}
          />
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnIncome, styles.modalSaveBtn]} onPress={saveItem}>
          <Text style={styles.btnText}>{form.editId ? "حفظ التعديلات ✓" : "حفظ الصنف ✓"}</Text>
        </TouchableOpacity>
      </CustomModal>

      <CustomModal
        visible={modal === "stockItemDetail"}
        onClose={() => {
          setModal(null);
          setDetailMovements([]);
        }}
      >
        <Text style={styles.modalTitle}>تفاصيل الصنف</Text>
        {detailBalance ? (
          <View
            style={[
              styles.stockItemCard,
              { marginBottom: 16 },
              detailBalance.quantity <= 0 && styles.stockItemCardEmpty,
              styles.stockItemCardActive,
            ]}
          >
            <View style={styles.stockItemCardTop}>
              <Text style={styles.stockItemCardName} numberOfLines={2}>
                {detailBalance.item.name}
              </Text>
              {detailBalance.quantity <= 0 ? (
                <View style={styles.stockItemBadgeWarn}>
                  <Text style={styles.stockItemBadgeWarnText}>نفد الرصيد</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.stockItemRemainBox}>
              <Text style={styles.stockItemRemainLabel}>المتبقي</Text>
              <Text
                style={[
                  styles.stockItemRemainValue,
                  detailBalance.quantity <= 0 && { color: "#f43f5e" },
                ]}
              >
                {fmt(detailBalance.quantity)}{" "}
                <Text style={styles.stockItemRemainUnit}>
                  {getStockUnitLabel(detailBalance.item.unit)}
                </Text>
              </Text>
            </View>
            <View style={styles.stockItemMetaRow}>
              <View style={styles.stockItemMeta}>
                <Text style={styles.stockItemMetaLabel}>سعر الوحدة</Text>
                <Text style={styles.stockItemMetaValue}>
                  {fmt(detailBalance.avgCost)} {CURRENCY}
                </Text>
              </View>
              <View style={styles.stockItemMeta}>
                <Text style={styles.stockItemMetaLabel}>القيمة</Text>
                <Text style={[styles.stockItemMetaValue, { color: "#818cf8" }]}>
                  {fmt(detailBalance.totalValue)} {CURRENCY}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>الصنف غير موجود</Text>
        )}

        {detailBalance ? (
          <View style={{ marginBottom: 16 }}>
            <TouchableOpacity
              style={[styles.btn, { marginBottom: 10, backgroundColor: "rgba(251,191,36,0.18)" }]}
              onPress={() => openEditItem(detailBalance.item, true)}
            >
              <Text style={styles.btnText}>✏️ تعديل الصنف</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnIncome, { marginBottom: 10 }]}
              onPress={() => openPurchase(detailBalance.item.id)}
            >
              <Text style={styles.btnText}>+ شراء من مورد</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnExpense,
                { opacity: detailBalance.quantity <= 0 ? 0.5 : 1 },
              ]}
              onPress={() => openIssue(detailBalance.item.id)}
              disabled={detailBalance.quantity <= 0}
            >
              <Text style={styles.btnText}>📤 صرف لعميل</Text>
            </TouchableOpacity>
            {detailBalance.quantity <= 0 ? (
              <Text style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
                لا يوجد رصيد للصرف — سجّل شراء أولاً.
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.cardTitle, { fontSize: 16, marginBottom: 8 }]}>حركات الصنف</Text>
        {detailMovementsLoading ? (
          <ActivityIndicator color="#818cf8" style={{ marginVertical: 16 }} />
        ) : detailMovements.length === 0 ? (
          <Text style={styles.emptyText}>لا حركات لهذا الصنف في السنة المالية</Text>
        ) : (
          detailMovements.map((m) => {
            const item = itemMap[m.itemId]?.item || detailBalance?.item;
            const isIn = m.direction === "in";
            const partyLabel = isIn
              ? `المصدر: ${getSupplierName(m.supplierId)}`
              : `اسم العميل: ${getClientName(m.clientId)}`;
            return (
              <View
                key={m.id}
                style={[
                  styles.txItemStack,
                  {
                    borderColor: isIn ? "rgba(16,185,129,0.3)" : "rgba(251,146,60,0.3)",
                    marginBottom: 8,
                  },
                ]}
              >
                <View style={styles.txItemRow}>
                  <Text style={styles.txIcon}>{isIn ? "📥" : "📤"}</Text>
                  <Text style={{ color: "#e2e8f0", fontWeight: "600", flex: 1 }}>
                    {isIn ? "دخول (شراء)" : "خروج (صرف)"}
                  </Text>
                  <Text style={styles.txDate}>{m.date}</Text>
                </View>
                <Text style={{ color: "#94a3b8", marginTop: 4 }}>
                  {fmt(m.quantity, 2)} {getStockUnitLabel(item?.unit)} × {fmt(m.unitPrice, 2)} ={" "}
                  {fmt(m.quantity * m.unitPrice)} {CURRENCY}
                </Text>
                <Text style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>{partyLabel}</Text>
                {m.note ? (
                  <Text style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{m.note}</Text>
                ) : null}
                <View style={[styles.txItemButtons, { marginTop: 8 }]}>
                  <TouchableOpacity style={styles.txEditBtn} onPress={() => openEditMovement(m, true)}>
                    <Text style={styles.txEditBtnText}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.txDeleteBtn} onPress={() => handleDeleteMovement(m.id)}>
                    <Text style={styles.txDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </CustomModal>

      {rowMenuPos?.item ? (
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
              onPress={() => {
                const id = rowMenuPos.item.id;
                closeRowMenu();
                openItemDetail(id);
              }}
            >
              <Text style={styles.stockRowMenuItemText}>عرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockRowMenuItem}
              onPress={() => {
                const item = rowMenuPos.item;
                closeRowMenu();
                openEditItem(item);
              }}
            >
              <Text style={[styles.stockRowMenuItemText, { color: "#fbbf24" }]}>تعديل</Text>
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
