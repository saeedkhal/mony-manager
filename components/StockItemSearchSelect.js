import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  STOCK_ITEM_SELECT_DEFAULT_LIMIT,
  STOCK_ITEM_SELECT_MIN_CHARS,
  searchStockItemsForSelect,
} from "../utils/db";
import { fmt } from "../utils/helpers";
import { getStockUnitLabel } from "../utils/stockHelpers";

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_RESULT_LIMIT = 10;

function itemBalanceText(row) {
  return `رصيد ${fmt(row.quantity)} ${getStockUnitLabel(row.unit)}`;
}

/**
 * Combobox: closed select field, opens into a search input + overlay dropdown.
 */
export default function StockItemSearchSelect({
  styles,
  value = null,
  selectedLabel = "",
  error,
  onChange,
  active = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  useEffect(() => {
    if (!active || !open) return undefined;
    const trimmed = query.trim();
    const searching = trimmed.length >= STOCK_ITEM_SELECT_MIN_CHARS;
    const q = searching ? trimmed : "";
    const delay = searching ? SEARCH_DEBOUNCE_MS : 0;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchStockItemsForSelect(q, searching ? SEARCH_RESULT_LIMIT : STOCK_ITEM_SELECT_DEFAULT_LIMIT)
        .then((rows) => {
          if (!cancelled) setResults(rows || []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, active, open]);

  const typedLen = query.trim().length;
  const showMinHint = typedLen > 0 && typedLen < STOCK_ITEM_SELECT_MIN_CHARS;
  const displayLabel = selectedLabel || "اختر الصنف";
  const hasValue = value != null && String(selectedLabel || "").trim() !== "";

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const openMenu = () => {
    if (!active) return;
    const node = fieldRef.current;
    const show = (x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setQuery("");
      setOpen(true);
    };
    requestAnimationFrame(() => {
      if (node && typeof node.measureInWindow === "function") {
        node.measureInWindow((x, y, w, h) => show(x, y, w, h));
        return;
      }
      show(24, 160, 280, 44);
    });
  };

  const handleSelect = (item) => {
    onChange?.(item);
    close();
  };

  let emptyText = "";
  if (showMinHint) emptyText = `اكتب ${STOCK_ITEM_SELECT_MIN_CHARS} حروف على الأقل`;
  else if (results.length === 0 && !loading) {
    emptyText =
      typedLen >= STOCK_ITEM_SELECT_MIN_CHARS ? "لا توجد نتائج" : "لا توجد أصناف";
  }

  return (
    <View>
      <View
        ref={fieldRef}
        collapsable={false}
        style={[local.select, error ? styles.inputError : null, open && local.selectOpen]}
      >
        <TouchableOpacity style={local.selectHit} onPress={openMenu} activeOpacity={0.85}>
          <Text
            style={[local.selectText, hasValue ? local.selectTextValue : null]}
            numberOfLines={1}
          >
            {displayLabel}
          </Text>
          <Text style={local.selectChevron}>▾</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={local.modalRoot}>
          <Pressable style={local.backdrop} onPress={close} />
          {anchor ? (
            <View
              style={[
                local.panel,
                {
                  top: anchor.y,
                  left: anchor.x,
                  width: Math.max(anchor.w, 160),
                },
              ]}
            >
              <View style={local.combo}>
                <View style={local.searchWrap}>
                  <TextInput
                    style={local.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="ابحث باسم الصنف..."
                    placeholderTextColor="#64748b"
                    autoFocus
                    underlineColorAndroid="transparent"
                  />
                  <Text style={local.searchIcon}>🔍</Text>
                </View>
                <View style={local.dropdown}>
                  {loading && results.length === 0 ? (
                    <ActivityIndicator color="#818cf8" style={{ marginVertical: 14 }} />
                  ) : emptyText ? (
                    <Text style={local.empty}>{emptyText}</Text>
                  ) : (
                    <ScrollView
                      style={local.list}
                      keyboardShouldPersistTaps="always"
                      nestedScrollEnabled
                    >
                      {results.map((item) => {
                        const selected = Number(value) === Number(item.id);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[local.item, selected && local.itemSelected]}
                            onPress={() => handleSelect(item)}
                            activeOpacity={0.75}
                          >
                            <Text
                              style={[local.itemText, selected && local.itemTextSelected]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text style={local.itemMeta} numberOfLines={1}>
                              {itemBalanceText(item)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

const local = StyleSheet.create({
  select: {
    width: "100%",
    minHeight: 46,
    backgroundColor: "#0b1220",
    borderWidth: 1.5,
    borderColor: "rgba(129,140,248,0.35)",
    borderRadius: 12,
    overflow: "hidden",
  },
  selectOpen: {
    borderColor: "#818cf8",
  },
  selectHit: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 8,
  },
  selectText: {
    flex: 1,
    color: "#64748b",
    fontSize: 15,
    textAlign: "right",
    writingDirection: "rtl",
  },
  selectTextValue: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  selectChevron: {
    color: "#94a3b8",
    fontSize: 13,
  },
  modalRoot: {
    flex: 1,
    direction: "ltr",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: "absolute",
    direction: "rtl",
  },
  combo: {
    backgroundColor: "#0b1220",
    borderWidth: 1.5,
    borderColor: "#818cf8",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 22,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.12)",
  },
  searchInput: {
    flex: 1,
    color: "#f8fafc",
    fontSize: 15,
    paddingVertical: 11,
    textAlign: "right",
    writingDirection: "rtl",
  },
  searchIcon: {
    fontSize: 13,
    marginHorizontal: 4,
    opacity: 0.55,
  },
  dropdown: {
    backgroundColor: "#1e293b",
    maxHeight: 280,
  },
  empty: {
    color: "#94a3b8",
    fontSize: 13,
    paddingVertical: 14,
    paddingHorizontal: 14,
    textAlign: "right",
  },
  list: {
    maxHeight: 260,
  },
  item: {
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  itemSelected: {
    backgroundColor: "rgba(148,163,184,0.16)",
  },
  itemText: {
    color: "#f1f5f9",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "right",
    writingDirection: "rtl",
    width: "100%",
  },
  itemTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  itemMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
    writingDirection: "rtl",
    width: "100%",
  },
});
