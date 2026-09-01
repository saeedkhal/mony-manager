import React, { useState, forwardRef, useRef } from "react";
import { TextInput, View, Text } from "react-native";
import { useEnsureFocusedInputVisible } from "../hooks/useKeyboardBottomPad";

/**
 * TextInput with focus ring using AppStyles `input` + `inputFocused` + optional `inputError`.
 * @param {object} styles - style sheet containing `input`, `inputFocused`, `inputError`, `fieldErrorText`
 * @param {string} [error] - when set, shows red message below the field
 */
const FormTextInput = forwardRef(function FormTextInput(
  { styles, style, onFocus, onBlur, error, underlineColorAndroid = "transparent", ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const ensureVisible = useEnsureFocusedInputVisible();
  const innerRef = useRef(null);
  const setInputRef = (node) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  return (
    <View style={{ width: "100%" }}>
      <TextInput
        ref={setInputRef}
        {...rest}
        underlineColorAndroid={underlineColorAndroid}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
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
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
});

export default FormTextInput;
