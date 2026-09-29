import { createNavigationContainerRef } from "@react-navigation/native"
import type { RootStackParamList } from "./RootNavigator"

/**
 * The single container ref for the root native stack. Root-level concerns
 * (bottom tabs, notification taps, realtime room routing, the match modal)
 * navigate through it; screens keep using their own `navigation` prop.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>()
