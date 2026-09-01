import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, TextInput } from "react-native";

const KeyboardScrollContext = createContext(null);

/** Called from FormTextInput so the parent ScrollView can raise the focused field. */
export function useEnsureFocusedInputVisible() {
  return useContext(KeyboardScrollContext);
}

/**
 * Extra bottom padding so ScrollViews can scroll focused fields and actions above the keyboard.
 */
export function useKeyboardBottomPad(extra = 24) {
  const [pad, setPad] = useState(0);
  const keyboardTopRef = useRef(Dimensions.get("window").height);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => {
      const h = Number(e?.endCoordinates?.height) || 0;
      const top = Number(e?.endCoordinates?.screenY);
      keyboardTopRef.current = Number.isFinite(top)
        ? top
        : Dimensions.get("window").height - h;
      setPad(Math.max(0, h) + extra);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      keyboardTopRef.current = Dimensions.get("window").height;
      setPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [extra]);

  return { pad, keyboardTopRef };
}

function scrollNodeAboveKeyboard(node, scrollRef, offsetYRef, keyboardTopRef, gap) {
  if (!node || typeof node.measureInWindow !== "function") return;
  const scroller = scrollRef.current;
  if (!scroller || typeof scroller.scrollTo !== "function") return;
  node.measureInWindow((_x, y, _w, h) => {
    const limit = (keyboardTopRef.current || Dimensions.get("window").height) - gap;
    const overflow = y + h - limit;
    if (overflow <= 8) return;
    scroller.scrollTo({
      y: Math.max(0, (offsetYRef.current || 0) + overflow),
      animated: true,
    });
  });
}

/**
 * ScrollView helpers: extra bottom pad + keep the focused TextInput above the keyboard.
 */
export function useKeyboardAwareScroll({ extraPad = 24, gap = 36 } = {}) {
  const { pad, keyboardTopRef } = useKeyboardBottomPad(extraPad);
  const scrollRef = useRef(null);
  const offsetYRef = useRef(0);

  const ensureVisible = useCallback(
    (node) => {
      const target = node || TextInput.State?.currentlyFocusedInput?.();
      if (!target) return;
      const delay = Platform.OS === "ios" ? 60 : 120;
      requestAnimationFrame(() => {
        setTimeout(
          () => scrollNodeAboveKeyboard(target, scrollRef, offsetYRef, keyboardTopRef, gap),
          delay
        );
      });
    },
    [gap, keyboardTopRef]
  );

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      const focused = TextInput.State?.currentlyFocusedInput?.();
      if (focused) ensureVisible(focused);
    });
    return () => sub.remove();
  }, [ensureVisible]);

  const onScroll = useCallback((e) => {
    offsetYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const Provider = useCallback(
    ({ children }) => (
      <KeyboardScrollContext.Provider value={ensureVisible}>{children}</KeyboardScrollContext.Provider>
    ),
    [ensureVisible]
  );

  return { scrollRef, keyboardPad: pad, onScroll, Provider };
}
