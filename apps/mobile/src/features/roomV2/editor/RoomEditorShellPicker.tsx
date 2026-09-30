import { Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomShell } from "../roomV2.types"
import { styles } from "./roomEditorStyles"

/** Room style chooser, shown only when more than one production shell exists. */
export function RoomEditorShellPicker(props: {
  copy: MyRoomEditorCopy
  shells: readonly RoomShell[]
  selectedRoomShellId: string | undefined
  onSelectRoomShell: (roomShellId: string) => void
}) {
  const { copy, shells, selectedRoomShellId, onSelectRoomShell } = props
  return (
    <View style={styles.shellPicker}>
      <Text style={styles.shellPickerLabel}>{copy.roomStyle}</Text>
      <View style={styles.shellPickerOptions}>
        {shells.map((shell) => {
          const selected = selectedRoomShellId === shell.id
          return (
            <Pressable
              key={shell.id}
              accessibilityRole="button"
              accessibilityLabel={copy.chooseShell(shell.name)}
              accessibilityState={{ selected }}
              onPress={() => onSelectRoomShell(shell.id)}
              style={[
                styles.shellPickerOption,
                selected ? styles.shellPickerOptionSelected : null
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.shellPickerOptionText,
                  selected ? styles.shellPickerOptionTextSelected : null
                ]}
              >
                {shell.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
