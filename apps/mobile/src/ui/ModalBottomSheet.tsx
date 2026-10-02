import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Modal, StyleSheet } from "react-native"
import type { StyleProp, ViewStyle } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SheetPresentationContext, type SheetPresentation } from "./sheetPresentation"
import { SwipeDismissSheet, useSwipeDismissSheetClose, type SwipeDismissSheetBackdrop } from "./SwipeDismissSheet"

export interface ModalBottomSheetProps {
  visible: boolean
  /** The sheet is gone (swipe, backdrop, back button or `close()` from content). */
  onClose: () => void
  sheetStyle?: StyleProp<ViewStyle>
  backdrop?: SwipeDismissSheetBackdrop
  grabber?: boolean
  testID?: string
  children: ReactNode
}

/**
 * The bottom sheet where native form sheets are not used (Android, see
 * navigation/nativeSheets): a React Native `Modal` around `SwipeDismissSheet`
 * that gives its content the same `useSheetPresentation()` API as the
 * native sheet route.
 */
export function ModalBottomSheet({
  visible,
  onClose,
  sheetStyle,
  backdrop,
  grabber = true,
  testID,
  children
}: ModalBottomSheetProps) {
  const [dismissible, setDismissible] = useState(true)
  const afterDismissRef = useRef<(() => void)[]>([])

  const handleDismiss = useCallback(() => {
    const afterDismiss = afterDismissRef.current
    afterDismissRef.current = []
    onClose()
    for (const work of afterDismiss) work()
  }, [onClose])

  const handleRequestClose = useCallback(() => {
    if (dismissible) handleDismiss()
  }, [dismissible, handleDismiss])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <GestureHandlerRootView style={styles.overlay}>
        <SwipeDismissSheet
          onDismiss={handleDismiss}
          enabled={dismissible}
          backdrop={backdrop
            ? { ...backdrop, onPress: backdrop.onPress ? handleRequestClose : undefined }
            : undefined}
          grabber={grabber}
          accessibilityViewIsModal
          testID={testID}
          style={sheetStyle}
        >
          <ModalSheetPresentationProvider
            afterDismissRef={afterDismissRef}
            dismissible={dismissible}
            fallbackClose={handleDismiss}
            setDismissible={setDismissible}
          >
            {children}
          </ModalSheetPresentationProvider>
        </SwipeDismissSheet>
      </GestureHandlerRootView>
    </Modal>
  )
}

function ModalSheetPresentationProvider(props: {
  afterDismissRef: { current: (() => void)[] }
  dismissible: boolean
  fallbackClose: () => void
  setDismissible: (dismissible: boolean) => void
  children: ReactNode
}) {
  const { afterDismissRef, dismissible, fallbackClose, setDismissible, children } = props
  // The sheet's own exit (same as a swipe), then its onDismiss. A locked
  // sheet ignores its exit, so a programmatic close then closes at once.
  const swipeClose = useSwipeDismissSheetClose()
  const closeRef = useRef(fallbackClose)
  useLayoutEffect(() => {
    closeRef.current = (dismissible ? swipeClose : null) ?? fallbackClose
  }, [dismissible, fallbackClose, swipeClose])
  // Stable, so content callbacks that close later never hold a stale lock.
  const presentation = useMemo<SheetPresentation>(() => ({
    close: (afterDismiss) => {
      if (afterDismiss) afterDismissRef.current.push(afterDismiss)
      closeRef.current()
    },
    setDismissible
  }), [afterDismissRef, setDismissible])
  return (
    <SheetPresentationContext.Provider value={presentation}>
      {children}
    </SheetPresentationContext.Provider>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  }
})
