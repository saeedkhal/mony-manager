import { TextInput } from "react-native";

// Every TextInput (including libraries) gets a transparent Android underline by default.
const prev = TextInput.defaultProps;
TextInput.defaultProps = {
  ...(prev != null ? prev : {}),
  underlineColorAndroid: "transparent",
};
