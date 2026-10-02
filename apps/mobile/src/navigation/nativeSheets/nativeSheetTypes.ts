import type { DiscoverFiltersSheetContentProps } from "../../components/DiscoverFiltersBottomSheet"
import type { ReportSheetContentProps } from "../../components/ReportModal"
import type { CountryPickerSheetContentProps } from "../../components/CountryCallingCodePicker"
import type { InboxConversationActionsSheetContentProps } from "../../features/inbox/InboxConversationActionsSheet"
import type { NativeSheetKind } from "./nativeSheetModel"

/** The in-memory props each sheet kind receives through the registry. */
export interface NativeSheetPropsByKind {
  discoverFilters: DiscoverFiltersSheetContentProps
  report: ReportSheetContentProps
  countryPicker: CountryPickerSheetContentProps
  inboxConversationActions: InboxConversationActionsSheetContentProps
}

// Compile-time proof that every sheet kind has a props entry.
type MissingKinds = Exclude<NativeSheetKind, keyof NativeSheetPropsByKind>
const everyKindHasProps: [MissingKinds] extends [never] ? true : MissingKinds = true
void everyKindHasProps
