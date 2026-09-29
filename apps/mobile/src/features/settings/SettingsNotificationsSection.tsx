import Ionicons from "@expo/vector-icons/Ionicons"
import { Switch, Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import { NOTIFICATION_PREFERENCE_ROWS } from "../notifications/notificationPreferencesModel"
import type { SettingsCopy } from "./settingsCopy"
import {
  getNotificationPreferenceRowVisual,
  isSettingsLoadPending
} from "./settingsPresentationModel"
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
        {isSettingsLoadPending(notificationPreferencesStatus) ? (
          <View style={styles.emptyRow} accessibilityLiveRegion="polite">
            <Ionicons accessible={false} name="notifications-outline" size={20} color={uiTheme.colors.textMuted} />
            <Text style={styles.emptyText}>{copy.notificationsLoading}</Text>
          </View>
        ) : notificationPreferencesStatus === "error" ? (
          <SettingsRow
            icon="refresh"
            iconColors={uiTheme.gradients.warm}
            label={copy.notificationsUnavailable}
            value={copy.notificationsRetry}
            chevron
            isLast
            onPress={() => void loadNotificationPreferences()}
          />
        ) : notificationPreferences ? (
          NOTIFICATION_PREFERENCE_ROWS.map((row, index) => {
            const visual = getNotificationPreferenceRowVisual(row.key)
            return (
              <SettingsRow
                key={row.key}
                icon={visual.icon}
                iconColors={uiTheme.gradients[visual.gradient]}
                label={row.label}
                description={row.description}
                isLast={index === NOTIFICATION_PREFERENCE_ROWS.length - 1}
              >
                <Switch
                  accessibilityRole="switch"
                  accessibilityLabel={copy.notificationToggle(row.label)}
                  accessibilityHint={row.description}
                  accessibilityState={{
                    checked: notificationPreferences[row.key],
                    disabled: isSavingNotificationPreferences
                  }}
                  disabled={isSavingNotificationPreferences}
                  value={notificationPreferences[row.key]}
                  onValueChange={(enabled) => handleNotificationToggle(row.key, enabled)}
                  trackColor={{ false: "#E6DCE4", true: "#FF9BC5" }}
                  thumbColor="#FFFFFF"
                />
              </SettingsRow>
            )
          })
        ) : null}
      </View>
      <Text style={styles.privacyNote}>
        {copy.notificationNote}
      </Text>
    </View>
  )
}
