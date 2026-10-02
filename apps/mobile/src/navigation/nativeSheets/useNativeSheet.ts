import { useEffect, useLayoutEffect, useRef } from "react"
import { Platform } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../RootNavigator"
import {
  NATIVE_SHEET_ROUTE_NAME,
  shouldPresentAsNativeSheet,
  type NativeSheetKind
} from "./nativeSheetModel"
import { nativeSheetRegistry } from "./nativeSheetRegistry"
import type { NativeSheetPropsByKind } from "./nativeSheetTypes"

const PRESENTS_NATIVELY = shouldPresentAsNativeSheet(Platform.OS)

/**
 * Presents a sheet declaratively from the screen that owns its state:
 * non-null `props` shows it, null closes it, `onDismiss` reports that the
 * user closed it (swipe, tap outside, close button). On iOS it pushes the
 * `NativeSheet` form-sheet route; the route's params carry only ids, the
 * props travel through the registry. Returns false where the caller must
 * render its own Modal fallback (Android).
 */
export function useNativeSheet<K extends NativeSheetKind>(
  kind: K,
  props: NativeSheetPropsByKind[K] | null,
  onDismiss: () => void
): boolean {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const requestIdRef = useRef<string | null>(null)
  const propsRef = useRef(props)
  const onDismissRef = useRef(onDismiss)
  const visible = props !== null

  useLayoutEffect(() => {
    propsRef.current = props
    onDismissRef.current = onDismiss
    const requestId = requestIdRef.current
    if (requestId && props !== null) nativeSheetRegistry.update(requestId, props)
  })

  useEffect(() => {
    if (!PRESENTS_NATIVELY) return
    const current = requestIdRef.current
    if (visible && current === null) {
      const requestId = nativeSheetRegistry.open(kind, propsRef.current, () => {
        if (requestIdRef.current === requestId) requestIdRef.current = null
        onDismissRef.current()
      })
      requestIdRef.current = requestId
      navigation.push(NATIVE_SHEET_ROUTE_NAME, { sheet: kind, requestId })
      return
    }
    if (!visible && current !== null) {
      nativeSheetRegistry.requestClose(current)
    }
  }, [kind, navigation, visible])

  useEffect(() => () => {
    const requestId = requestIdRef.current
    requestIdRef.current = null
    if (requestId) nativeSheetRegistry.release(requestId)
  }, [])

  return PRESENTS_NATIVELY
}
