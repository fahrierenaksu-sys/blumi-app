import Ionicons from "@expo/vector-icons/Ionicons"
import { ActionButtonCircle } from "./primitives"
import { uiTheme } from "./theme"

/**
 * The one back control for pushed screens: the iOS chevron in the shared
 * 40 pt circle, so every screen goes back with the same icon (DSC-16).
 */
export function BackButton(props: { accessibilityLabel: string; onPress: () => void }) {
  return (
    <ActionButtonCircle accessibilityLabel={props.accessibilityLabel} onPress={props.onPress} size={40}>
      <Ionicons name="chevron-back" size={22} color={uiTheme.colors.textPrimary} />
    </ActionButtonCircle>
  )
}
