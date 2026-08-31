import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Extra bottom padding so ScrollViews can scroll focused fields and actions above the keyboard.
 */
export function useKeyboardBottomPad(extra = 24) {
  const [pad, setPad] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => {
      const h = Number(e?.endCoordinates?.height) || 0;
      setPad(Math.max(0, h) + extra);
    });
    const hide = Keyboard.addListener(hideEvt, () => setPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [extra]);

  return pad;
}
