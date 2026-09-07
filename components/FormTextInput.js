import React, { useState, forwardRef, useRef } from "react";
import { TextInput, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEnsureFocusedInputVisible } from "../hooks/useKeyboardBottomPad";
import NumberCalculator from "./NumberCalculator";

const CALC_KEYBOARDS = new Set(["numeric", "decimal-pad", "number-pad"]);

/**
 * TextInput with focus ring using AppStyles `input` + `inputFocused` + optional `inputError`.
 * Numeric fields show a calculator button (جمع / طرح / ضرب / قسمة).
 * @param {object} styles - style sheet containing `input`, `inputFocused`, `inputError`, `fieldErrorText`
 * @param {string} [error] - when set, shows red message below the field
 * @param {boolean} [calculator] - force calculator on/off; default on for numeric keyboards
 */
const FormTextInput = forwardRef(function FormTextInput(
  {
    styles,
    style,
    onFocus,
    onBlur,
    error,
    underlineColorAndroid = "transparent",
    keyboardType,
    onChangeText,
    value,
    calculator,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const ensureVisible = useEnsureFocusedInputVisible();
  const innerRef = useRef(null);
  const setInputRef = (node) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const showCalc = calculator ?? CALC_KEYBOARDS.has(keyboardType);

  return (
    <View style={{ width: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          ref={setInputRef}
          {...rest}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          underlineColorAndroid={underlineColorAndroid}
          style={[
            styles.input,
            focused && styles.inputFocused,
            error ? styles.inputError : null,
            style,
            showCalc ? { flex: 1, minWidth: 0, width: undefined } : null,
          ]}
          onFocus={(e) => {
            setFocused(true);
            ensureVisible?.(innerRef.current);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {showCalc ? (
          <TouchableOpacity
            onPress={() => setCalcOpen(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "rgba(129,140,248,0.18)",
              borderWidth: 1,
              borderColor: "rgba(129,140,248,0.4)",
              alignItems: "center",
              justifyContent: "center",
            }}
            accessibilityLabel="حاسبة"
          >
            <Ionicons name="calculator-outline" size={22} color="#818cf8" />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
      {showCalc ? (
        <NumberCalculator
          visible={calcOpen}
          initialValue={value}
          onClose={() => setCalcOpen(false)}
          onApply={(n) => onChangeText?.(n)}
        />
      ) : null}
    </View>
  );
});

export default FormTextInput;
