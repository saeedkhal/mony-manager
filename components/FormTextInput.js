import React, { useState, forwardRef } from "react";
import { TextInput, View, Text } from "react-native";

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
  return (
    <View style={{ width: "100%" }}>
      <TextInput
        ref={ref}
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
