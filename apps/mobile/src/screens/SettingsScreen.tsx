import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import Constants from "expo-constants"
import { useCallback } from "react"
import { Alert, Platform, Text, View } from "react-native"
import { PageSafeArea as SafeAreaView, PageScrollContent } from "../ui/layout/PageContainer"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { useBlockStore } from "../features/safety/blockStore"
import type { UpdateSessionProfileInput } from "../features/session/sessionApi"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { SoftBlobBackground } from "../ui/backgrounds"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { useAnalyticsConsent } from "../analytics/analyticsConsent"
import { DiscoverFiltersBottomSheet } from "../components/DiscoverFiltersBottomSheet"
import { getSettingsCopy } from "../features/settings/settingsCopy"
import { getAppLocale } from "../features/session/authLocale"
import {
  AccountDataExportModal,
  AccountDeletionModal,
  PhoneChangeModal
} from "../features/settings/AccountVerificationModals"
import { SettingsAccountSection } from "../features/settings/SettingsAccountSection"
import { SettingsAboutSection, SettingsLegalSection } from "../features/settings/SettingsInfoSections"
import { SettingsMatchingSection } from "../features/settings/SettingsMatchingSection"
import { SettingsNotificationsSection } from "../features/settings/SettingsNotificationsSection"
import { SettingsPrivacySection } from "../features/settings/SettingsPrivacySection"
import { SettingsSafetySection } from "../features/settings/SettingsSafetySection"
import { settingsStyles as styles } from "../features/settings/settingsStyles"
import { useAccountDataExport } from "../features/settings/useAccountDataExport"
import { useAccountDeletion } from "../features/settings/useAccountDeletion"
import { useHiddenPeople } from "../features/settings/useHiddenPeople"
import { useMatchingPreferences } from "../features/settings/useMatchingPreferences"
import { useMyReports } from "../features/settings/useMyReports"
import { useNotificationSettings } from "../features/settings/useNotificationSettings"
import { usePhoneChange } from "../features/settings/usePhoneChange"

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0"
const BUILD_NUMBER = Platform.select({
  ios: Constants.expoConfig?.ios?.buildNumber,
  android: Constants.expoConfig?.android?.versionCode?.toString()
})
  ?? "1"
const VERSION_LABEL = `v${APP_VERSION} (${BUILD_NUMBER})`


type SettingsScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "Settings"
> & {
  sessionActor: SessionActor
  onResetSession: () => Promise<void>
  onUpdateProfile: (input: UpdateSessionProfileInput) => Promise<void>
  pushPermissionStatus: "unknown" | "undetermined" | "granted" | "denied"
  isRequestingPushPermission: boolean
  onRequestPushPermission: () => Promise<void>
}

/* ── Main Screen ───────────────────────────────────────────── */

/**
 * Thin composition of the Settings sections. Hooks are called in the same
 * order the original single-component screen declared its state and effects,
 * so mount-time requests fire in the same sequence.
 */
export function SettingsScreen(props: SettingsScreenProps) {
  const {
    navigation,
    onRequestPushPermission,
    onResetSession,
    onUpdateProfile,
    pushPermissionStatus,
    sessionActor
  } = props
  const locale = getAppLocale()
  const copy = getSettingsCopy(locale)
  const isProduction = sessionActor.session.mode === "production"
  const { blockedUserIds, blockedProfilesById, unblockUser } = useBlockStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const deletion = useAccountDeletion({ sessionActor, copy, locale, onResetSession })
  const dataExport = useAccountDataExport({ sessionActor, copy, locale })
  const phoneChange = usePhoneChange({ sessionActor, copy, locale, onResetSession })
  const analyticsConsent = useAnalyticsConsent()
  const matching = useMatchingPreferences(sessionActor, onUpdateProfile)
  const myReports = useMyReports(sessionActor)
  const notifications = useNotificationSettings({
    sessionActor,
    pushPermissionStatus,
    onRequestPushPermission
  })
  const handleUnblock = useHiddenPeople({ sessionActor, copy, locale, unblockUser })
  const handleGoBack = useCallback(() => {
    goBackOrFallback(navigation, () => navigation.replace("You"))
  }, [navigation])

  const openLegal = useCallback(
    (type: "privacy" | "terms" | "guidelines") => {
      navigation.navigate("Legal", { type })
    },
    [navigation]
  )
  const handleOpenPrivacy = useCallback(() => {
    openLegal("privacy")
  }, [openLegal])
  const handleOpenTerms = useCallback(() => {
    openLegal("terms")
  }, [openLegal])
  const handleOpenGuidelines = useCallback(() => {
    openLegal("guidelines")
  }, [openLegal])
  const handleSignOutPrompt = useCallback(() => {
    Alert.alert(
      copy.signOutTitle,
      copy.signOutBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: copy.signOut,
          style: "destructive",
          onPress: () => {
            void onResetSession()
          }
        }
      ]
    )
  }, [copy, onResetSession])

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView
        contentGutter
        style={styles.safe}
        edges={["top", "left", "right", "bottom"]}
      >
        <TopBar
          title={copy.title}
          titleAlign="start"
          leftSlot={
            <ActionButtonCircle accessibilityLabel={copy.back} onPress={handleGoBack} size={40}>
              <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
          }
        />

        <PageScrollContent
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <SettingsMatchingSection
            copy={copy}
            locale={locale}
            matchingFilters={matching.matchingFilters}
            onOpenMatchingFilters={matching.openMatchingFilters}
          />

          {isProduction ? (
            <SettingsNotificationsSection
              copy={copy}
              pushPermissionStatus={pushPermissionStatus}
              isRequestingPushPermission={props.isRequestingPushPermission}
              notifications={notifications}
            />
          ) : null}

          <SettingsSafetySection
            copy={copy}
            locale={locale}
            isProduction={isProduction}
            blockedUserIds={blockedUserIds}
            blockedProfilesById={blockedProfilesById}
            onUnblock={handleUnblock}
            myReports={myReports}
          />

          <SettingsPrivacySection copy={copy} analyticsConsent={analyticsConsent} />

          <SettingsAboutSection copy={copy} versionLabel={VERSION_LABEL} />

          <SettingsLegalSection
            copy={copy}
            onOpenPrivacy={handleOpenPrivacy}
            onOpenTerms={handleOpenTerms}
            onOpenGuidelines={handleOpenGuidelines}
          />

          <SettingsAccountSection
            copy={copy}
            onDataExport={dataExport.handleDataExportPrompt}
            onPhoneChange={phoneChange.handlePhoneChangePrompt}
            onSignOut={handleSignOutPrompt}
            onDeleteAccount={deletion.handleDeleteAccountPrompt}
          />

          {/* ── Footer ────────────────────────────────────── */}
          <View style={styles.footerWrap}>
            <Text style={styles.footerTagline}>
              {copy.tagline}
            </Text>
            <Text style={styles.footerVersion}>Blumi {VERSION_LABEL}</Text>
          </View>
        </PageScrollContent>
      </SafeAreaView>
      <DiscoverFiltersBottomSheet
        visible={matching.matchingFiltersVisible}
        initialFilters={matching.matchingFilters}
        onClose={matching.closeMatchingFilters}
        onApply={matching.handleApplyMatchingFilters}
      />
      <AccountDataExportModal copy={copy} dataExport={dataExport} />
      <PhoneChangeModal copy={copy} phoneChange={phoneChange} />
      <AccountDeletionModal copy={copy} deletion={deletion} />
    </View>
  )
}
