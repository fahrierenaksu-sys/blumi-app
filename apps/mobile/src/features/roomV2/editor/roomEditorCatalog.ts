import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../../../navigation/RootNavigator"
import {
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
} from "../roomV2Catalog"

/** The editor resolves only the production Room catalogs (no QA/candidate ingress). */
export const ACTIVE_ROOM_FURNITURE_CATALOG = ROOM_V2_FURNITURE_CATALOG
export const ACTIVE_ROOM_SHELL_CATALOG = ROOM_V2_SHELL_CATALOG
export const QA_OWNED_ROOM_ITEM_IDS = new Set<string>()

export type MyRoomEditorScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "MyRoomEditor"
>

export type MyRoomEditorNavigation = MyRoomEditorScreenProps["navigation"]
