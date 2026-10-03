import { Switch, Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import { NOTIFICATION_PREFERENCE_ROWS } from "../notifications/notificationPreferencesModel"
import type { SettingsCopy } from "./settingsCopy"
import { getNotificationPreferenceRowVisual } from "./settingsPresentationModel"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"
import type { PushPermissionStatus, useNotificationSettings } from "./useNotificationSettings"

/** Production-only notifications section: device permission plus server preferences. */
export function SettingsNotificationsSection(props: {
  copy: SettingsCopy
  pushPermissionStatus: PushPermissionStatus
  isRequestingPushPermission: boolean
  notifications: ReturnType<typeof useNotificationSettings>
}) {
  const { copy, isRequestingPushPermission, pushPermissionStatus } = props
  const {
    handleNotificationToggle,
    handleRequestPushPermission,
    isSavingNotificationPreferences,
    loadNotificationPreferences,
    notificationPreferences,
    notificationPreferencesStatus
  } = props.notifications

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.notifications}</Text>
      <View style={styles.sectionCard}>
        {pushPermissionStatus !== "granted" ? (
          <SettingsRow
            icon="notifications"
            iconColors={uiTheme.gradients.primary}
            label={
              pushPermissionStatus === "denied"
                ? copy.openNotificationSettings
                : copy.enableNotifications
            }
            description={copy.notificationDescription}
            value={
              isRequestingPushPermission
                ? copy.opening
                : copy.enable
            }
            chevron
            onPress={
              isRequestingPushPermission
                ? undefined
                : handleRequestPushPermission
            }
          />
        ) : null}
        {notificationPreferencesStatus === "error" && !notificationPreferences ? (
          <SettingsRow
            icon="refresh"
            iconColors={uiTheme.gradients.warm}
            label={copy.notificationsUnavailable}
            value={copy.notificationsRetry}
            chevron
            isLast
            onPress={() => void loadNotificationPreferences()}
          />
        ) : (
          // The rows are always here, at their final height. Until the
          // server has answered once their switches are disabled, so the
          // answer never inserts rows and pushes the page down.
          NOTIFICATION_PREFERENCE_ROWS.map((row, index) => {
            const visual = getNotificationPreferenceRowVisual(row.key)
            const rowCopy = copy.notificationRows[row.key]
            const isPlaceholder = notificationPreferences === null
            const checked = notificationPreferences?.[row.key] ?? false
            const disabled = isPlaceholder || isSavingNotificationPreferences
            return (
              <SettingsRow
                key={row.key}
                icon={visual.icon}
                iconColors={uiTheme.gradients[visual.gradient]}
                label={rowCopy.label}
                description={rowCopy.description}
                isLast={index === NOTIFICATION_PREFERENCE_ROWS.length - 1}
              >
                <Switch
                  accessibilityRole="switch"
                  accessibilityLabel={copy.notificationToggle(rowCopy.label)}
                  accessibilityHint={rowCopy.description}
                  accessibilityState={{ checked, disabled, busy: isPlaceholder }}
                  disabled={disabled}
                  value={checked}
                  onValueChange={(enabled) => handleNotificationToggle(row.key, enabled)}
                  trackColor={{ false: "#E6DCE4", true: "#FF9BC5" }}
                  thumbColor="#FFFFFF"
                />
              </SettingsRow>
            )
          })
        )}
      </View>
      <Text style={styles.privacyNote}>
        {copy.notificationNote}
      </Text>
    </View>
  )
}
