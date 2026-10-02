import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react"
import { StyleSheet, useWindowDimensions, View } from "react-native"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { DiscoverFiltersSheetContent } from "../../components/DiscoverFiltersBottomSheet"
import { ReportSheetContent } from "../../components/ReportModal"
import { CountryPickerSheetContent } from "../../components/CountryCallingCodePicker"
import { InboxConversationActionsSheetContent } from "../../features/inbox/InboxConversationActionsSheet"
import { SheetPresentationContext, type SheetPresentation } from "../../ui/sheetPresentation"
import { uiTheme } from "../../ui/theme"
import type { RootStackParamList } from "../RootNavigator"
import { type NativeSheetKind } from "./nativeSheetModel"
import { nativeSheetRegistry, type NativeSheetSnapshot } from "./nativeSheetRegistry"
import type { NativeSheetPropsByKind } from "./nativeSheetTypes"

type NativeSheetRouteProps = NativeStackScreenProps<RootStackParamList, "NativeSheet">

/** Largest share of the screen a content-sized sheet takes before it scrolls. */
const FIT_SHEET_MAX_HEIGHT = 0.92

/**
 * The `NativeSheet` route (iOS form sheet). It reads its props from the
 * registry by request id, pops itself when the request closes (or no longer
 * exists, for example after a state restore), and reports its unmount so the
 * opener learns the sheet is gone however it was dismissed.
 */
export function NativeSheetRoute({ navigation, route }: NativeSheetRouteProps) {
  const { requestId, sheet } = route.params
  const subscribe = useCallback(
    (listener: () => void) => nativeSheetRegistry.subscribe(requestId, listener),
    [requestId]
  )
  const getSnapshot = useCallback(() => nativeSheetRegistry.read(requestId), [requestId])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const poppedRef = useRef(false)
  const shouldPop = !snapshot || snapshot.phase === "closing"
  useEffect(() => {
    if (!shouldPop || poppedRef.current) return
    poppedRef.current = true
    const stillPresented = navigation.getState().routes.some((entry) => entry.key === route.key)
    if (stillPresented) navigation.goBack()
  }, [navigation, route.key, shouldPop])

  useEffect(() => () => {
    nativeSheetRegistry.dismissed(requestId)
  }, [requestId])

  const presentation = useMemo<SheetPresentation>(() => ({
    close: (afterDismiss) => {
      if (!nativeSheetRegistry.requestClose(requestId, afterDismiss) && !nativeSheetRegistry.read(requestId)) {
        afterDismiss?.()
      }
    },
    // A locked sheet ignores swipe and tap-outside (modalInPresentation).
    setDismissible: (dismissible) => navigation.setOptions({ gestureEnabled: dismissible })
  }), [navigation, requestId])

  if (!snapshot || snapshot.kind !== sheet) return null
  return (
    <SheetPresentationContext.Provider value={presentation}>
      <NativeSheetBody kind={sheet}>
        {renderNativeSheetContent(snapshot)}
      </NativeSheetBody>
    </SheetPresentationContext.Provider>
  )
}

function renderNativeSheetContent(snapshot: NativeSheetSnapshot): ReactNode {
  switch (snapshot.kind as NativeSheetKind) {
    case "discoverFilters":
      return <DiscoverFiltersSheetContent {...(snapshot.props as NativeSheetPropsByKind["discoverFilters"])} />
    case "report":
      return <ReportSheetContent {...(snapshot.props as NativeSheetPropsByKind["report"])} />
    case "countryPicker":
      return <CountryPickerSheetContent {...(snapshot.props as NativeSheetPropsByKind["countryPicker"])} />
    case "inboxConversationActions":
      return (
        <InboxConversationActionsSheetContent
          {...(snapshot.props as NativeSheetPropsByKind["inboxConversationActions"])}
        />
      )
    default:
      return null
  }
}

/**
 * Content-sized sheets keep an intrinsic height (no flex) capped below the
 * screen; the list sheet fills its detent. Both leave room for the native
 * grabber and the home indicator.
 */
function NativeSheetBody({ kind, children }: { kind: NativeSheetKind; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const fills = kind === "countryPicker"
  return (
    <View
      style={[
        styles.body,
        fills ? styles.fill : { maxHeight: Math.round(height * FIT_SHEET_MAX_HEIGHT) },
        fills ? styles.fillPadding : null,
        { paddingBottom: Math.max(insets.bottom, uiTheme.spacing.md) }
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    overflow: "hidden",
    paddingTop: uiTheme.spacing.md,
    backgroundColor: uiTheme.colors.background
  },
  fill: {
    flex: 1
  },
  fillPadding: {
    paddingHorizontal: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md
  }
})
