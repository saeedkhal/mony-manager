import React, { useState, forwardRef } from "react";
import { TextInput } from "react-native";

/**
 * TextInput with focus ring using AppStyles `input` + `inputFocused`.
 * @param {object} styles - style sheet containing `input` and `inputFocused`
 */
const FormTextInput = forwardRef(function FormTextInput(
  { styles, style, onFocus, onBlur, underlineColorAndroid = "transparent", ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      {...rest}
      underlineColorAndroid={underlineColorAndroid}
      style={[styles.input, focused && styles.inputFocused, style]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
});

export default FormTextInput;
