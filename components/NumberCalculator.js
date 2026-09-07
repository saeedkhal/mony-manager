import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const OPS = { "+": "+", "−": "-", "×": "*", "÷": "/" };

function toWesternDigits(s) {
  return String(s || "")
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 1776));
}

function parseDisplay(s) {
  const n = Number(toWesternDigits(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatCalcResult(n) {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 1e8) / 1e8;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

function applyOp(a, op, b) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? NaN : a / b;
  return b;
}

const KEYS = [
  ["C", "⌫", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
];

export default function NumberCalculator({ visible, initialValue = "", onClose, onApply }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return undefined;
    const seed = toWesternDigits(initialValue).trim();
    const n = Number(seed);
    setDisplay(seed !== "" && Number.isFinite(n) ? formatCalcResult(n) : "0");
    setAcc(null);
    setOp(null);
    setFresh(true);
    setError("");
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose?.();
      return true;
    });
    return () => sub.remove();
    // Seed only when the sheet opens; ignore parent re-renders while it stays visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pushDigit = (d) => {
    setError("");
    setDisplay((cur) => {
      if (fresh) {
        setFresh(false);
        return d === "." ? "0." : d;
      }
      if (d === "." && cur.includes(".")) return cur;
      if (cur === "0" && d !== ".") return d;
      if (cur.replace(".", "").length >= 14) return cur;
      return cur + d;
    });
  };

  const commitOp = (nextOp) => {
    const cur = parseDisplay(display);
    setError("");
    if (acc != null && op && !fresh) {
      const res = applyOp(acc, op, cur);
      if (!Number.isFinite(res)) {
        setError("لا يمكن القسمة على صفر");
        return;
      }
      const shown = formatCalcResult(res);
      setAcc(res);
      setDisplay(shown);
    } else {
      setAcc(cur);
    }
    setOp(nextOp);
    setFresh(true);
  };

  const equals = () => {
    const cur = parseDisplay(display);
    setError("");
    if (acc == null || !op) {
      setFresh(true);
      return;
    }
    const res = applyOp(acc, op, cur);
    if (!Number.isFinite(res)) {
      setError("لا يمكن القسمة على صفر");
      return;
    }
    setDisplay(formatCalcResult(res));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const onKey = (key) => {
    if (key === "C") {
      setDisplay("0");
      setAcc(null);
      setOp(null);
      setFresh(true);
      setError("");
      return;
    }
    if (key === "⌫") {
      setError("");
      if (fresh) return;
      setDisplay((cur) => {
        const next = cur.slice(0, -1);
        if (!next || next === "-") {
          setFresh(true);
          return "0";
        }
        return next;
      });
      return;
    }
    if (key === "=") {
      equals();
      return;
    }
    if (OPS[key]) {
      commitOp(OPS[key]);
      return;
    }
    pushDigit(key);
  };

  const apply = () => {
    let n = parseDisplay(display);
    if (acc != null && op && !fresh) {
      n = applyOp(acc, op, n);
    }
    if (!Number.isFinite(n)) {
      setError("لا يمكن القسمة على صفر");
      return;
    }
    onApply?.(formatCalcResult(n));
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.title}>حاسبة</Text>
          <View style={s.screen}>
            <Text style={s.opHint} numberOfLines={1}>
              {acc != null && op ? `${formatCalcResult(acc)} ${op === "*" ? "×" : op === "/" ? "÷" : op === "-" ? "−" : "+"}` : " "}
            </Text>
            <Text style={s.display} numberOfLines={1} adjustsFontSizeToFit>
              {display}
            </Text>
          </View>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={s.pad}>
            {KEYS.map((row) => (
              <View key={row.join("-")} style={s.row}>
                {row.map((key) => {
                  const wide = key === "0";
                  const opKey = key === "C" || key === "⌫" || OPS[key] || key === "=";
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        s.key,
                        wide && s.keyWide,
                        key === "=" && s.keyEq,
                        (key === "+" || key === "−" || key === "×" || key === "÷") && s.keyOp,
                        key === "C" && s.keyClear,
                      ]}
                      onPress={() => onKey(key)}
                    >
                      <Text style={[s.keyText, opKey && s.keyTextOp]}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.applyBtn} onPress={apply}>
            <Text style={s.applyText}>استخدم الناتج ✓</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
            <Text style={s.cancelText}>إغلاق</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: "#1e1b4b",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
    padding: 16,
  },
  title: {
    color: "#c4b5fd",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  screen: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    minHeight: 72,
    justifyContent: "center",
  },
  opHint: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "right",
    writingDirection: "ltr",
  },
  display: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "ltr",
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  pad: {
    direction: "ltr",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  key: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyWide: { flex: 2 },
  keyOp: { backgroundColor: "rgba(129,140,248,0.28)" },
  keyEq: { backgroundColor: "#6366f1" },
  keyClear: { backgroundColor: "rgba(244,63,94,0.22)" },
  keyText: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  keyTextOp: { fontWeight: "800" },
  applyBtn: {
    marginTop: 12,
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  applyText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  cancelBtn: { marginTop: 8, alignItems: "center", paddingVertical: 6 },
  cancelText: { color: "#94a3b8", fontSize: 14, fontWeight: "700" },
});
