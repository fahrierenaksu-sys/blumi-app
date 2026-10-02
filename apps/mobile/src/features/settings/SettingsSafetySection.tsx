import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import type { AppLocale } from "../session/appLocale"
import { BlockedUserRow } from "./BlockedUserRow"
import type { SettingsCopy } from "./settingsCopy"
import {
  formatMyReportDate,
  getMyReportPresentation,
  isSettingsLoadPending
} from "./settingsPresentationModel"
import { SettingsRow } from "./SettingsRow"
import { settingsStyles as styles } from "./settingsStyles"
import type { useMyReports } from "./useMyReports"
import { PressableScale } from "../../ui/PressableScale"

/* ── Safety / Hidden people ────────────────────── */

export function SettingsSafetySection(props: {
  copy: SettingsCopy
  locale: AppLocale
  isProduction: boolean
  blockedUserIds: string[]
  blockedProfilesById: Record<string, { displayName: string; avatarPresetId?: string } | undefined>
  onUnblock: (userId: string) => void
  myReports: ReturnType<typeof useMyReports>
}) {
  const { blockedProfilesById, blockedUserIds, copy, isProduction, locale, onUnblock } = props
  const { myReports, myReportsStatus, myReportsVisible, retryMyReports, toggleMyReports } = props.myReports

  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionOverline}>{copy.safety}</Text>
      <View style={styles.sectionCard}>
        {blockedUserIds.length === 0 ? (
          <View style={styles.emptyRow}>
            <View style={styles.iconCircle}>
              <LinearGradient
                colors={["#E2586C", "#FF8A9B"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons accessible={false} name="shield-checkmark" size={19} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={styles.emptyText}>
              {copy.noHiddenPeople}
            </Text>
          </View>
        ) : (
          blockedUserIds.map((userId, index) => (
            <BlockedUserRow
              key={userId}
              userId={userId}
              profile={blockedProfilesById[userId]}
              isLast={index === blockedUserIds.length - 1}
              onUnblock={onUnblock}
            />
          ))
        )}
        {isProduction ? (
          <>
            <SettingsRow
              icon="document-text"
              iconColors={uiTheme.gradients.cool}
              label={copy.myReports}
              description={copy.myReportsDescription}
              chevron
              isLast={!myReportsVisible}
              onPress={toggleMyReports}
            />
            {myReportsVisible ? (
              <View style={styles.myReportsPanel}>
                {isSettingsLoadPending(myReportsStatus) ? (
                  <Text accessibilityRole="text" style={styles.myReportMessage}>{copy.reportsLoading}</Text>
                ) : myReportsStatus === "error" ? (
                  <View style={styles.myReportErrorRow}>
                    <Text accessibilityRole="alert" style={styles.myReportMessage}>{copy.reportsUnavailable}</Text>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={copy.notificationsRetry}
                      onPress={retryMyReports}
                    >
                      <Text style={styles.myReportRetry}>{copy.notificationsRetry}</Text>
                    </PressableScale>
                  </View>
                ) : myReports.length === 0 ? (
                  <Text style={styles.myReportMessage}>{copy.noReports}</Text>
                ) : myReports.map((report, index) => {
                  const presentation = getMyReportPresentation(report.status, copy)
                  return (
                    <View key={report.reportId} style={[styles.myReportRow, index < myReports.length - 1 && styles.myReportDivider]}>
                      <View style={styles.myReportHeading}>
                        <Text style={styles.myReportStatus}>
                          {presentation.statusLabel}
                        </Text>
                        <Text style={styles.myReportDate}>
                          {formatMyReportDate(report.createdAt, locale)}
                        </Text>
                      </View>
                      <Text style={styles.myReportMessage}>
                        {presentation.response}
                      </Text>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  )
}
