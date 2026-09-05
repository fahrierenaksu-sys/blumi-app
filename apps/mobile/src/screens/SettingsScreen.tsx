import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import type { DiscoveryFilters } from "@blumi/contracts"
import Constants from "expo-constants"
import { shareAccountDataExportFile } from "../features/session/accountDataExport"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  hydrateBlockedUsersFromServer,
  useBlockStore
} from "../features/safety/blockStore"
import {
  unblockSafetyUser
} from "../features/safety/safetyApi"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences
} from "../features/notifications/notificationApi"
import {
  NOTIFICATION_PREFERENCE_ROWS,
  type NotificationPreferenceToggleKey,
  updateNotificationPreferenceToggle
} from "../features/notifications/notificationPreferencesModel"
import {
  confirmPhoneChange,
  deleteProductionAccount,
  downloadAccountDataExport,
  requestAccountDataExportChallenge,
  requestAccountDeletionChallenge,
  requestPhoneChangeCurrentChallenge,
  requestPhoneChangeNewNumberChallenge,
  verifyAccountDataExportCode,
  verifyAccountDeletionCode,
  verifyPhoneChangeCurrentCode,
  verifyPhoneChangeNewNumberCode
} from "../features/session/sessionApi"
import type { UpdateSessionProfileInput } from "../features/session/sessionApi"
import type { SessionActor } from "../features/session/sessionModel"
import {
  getSettingsActionErrorMessageForDisplay,
  getSettingsVerificationErrorToastForDisplay
} from "../features/session/settingsActionErrorCopy"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { Avatar } from "../ui/avatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { showToast } from "../ui/toast"
import { useAnalyticsConsent } from "../analytics/analyticsConsent"
import { DiscoverFiltersBottomSheet } from "../components/DiscoverFiltersBottomSheet"
import { CountryCallingCodePicker } from "../components/CountryCallingCodePicker"
import {
  analyzeLocalPhoneNumber,
  formatLocalPhoneNumber,
  type PhoneCountryCode
} from "../features/session/registerFlowModel"
import { getLocalPhonePlaceholder } from "../features/session/registerPresentationModel"
import {
  DEFAULT_DISCOVERY_FILTERS,
  formatDiscoveryFiltersSummary,
  loadDiscoveryFilters,
  persistDiscoveryFilters
} from "../features/discovery/discoveryFiltersModel"
import {
  toDiscoveryFilters,
  toDiscoveryPreferences
} from "../features/settings/settingsPreferencesModel"
import { getSettingsCopy } from "../features/settings/settingsCopy"
import { getAppLocale } from "../features/session/authLocale"

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

/* ── Animated Row ──────────────────────────────────────────── */

function SettingsRow(props: {
  icon: keyof typeof Ionicons.glyphMap
  iconColors: [string, string]
  label: string
  description?: string
  value?: string
  chevron?: boolean
  onPress?: () => void
  isLast?: boolean
  children?: React.ReactNode
}) {
  const { icon, iconColors, label, description, value, chevron, onPress, isLast, children } = props
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      ...uiTheme.animation.spring
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.spring
    }).start()
  }

  const content = (
    <>
      <View style={styles.iconCircle}>
        <LinearGradient
          colors={iconColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <Ionicons accessible={false} name={icon} size={19} color="#FFFFFF" />
        </LinearGradient>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {children}
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {chevron ? (
        <Ionicons accessible={false} name="chevron-forward" size={18} color={uiTheme.colors.textMuted} />
      ) : null}
    </>
  )

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}${value ? `, ${value}` : ""}`}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.row, !isLast && styles.rowDivider]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={[styles.row, !isLast && styles.rowDivider]}>{content}</View>
      )}
    </Animated.View>
  )
}

/* ── Main Screen ───────────────────────────────────────────── */

export function SettingsScreen(props: SettingsScreenProps) {
  const { navigation, onResetSession, onUpdateProfile, sessionActor } = props
  const locale = getAppLocale()
  const copy = getSettingsCopy(locale)
  const { blockedUserIds, blockedProfilesById, unblockUser } = useBlockStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deletionCode, setDeletionCode] = useState("")
  const [deletionCodeVisible, setDeletionCodeVisible] = useState(false)
  const [isExportingAccountData, setIsExportingAccountData] = useState(false)
  const exportControllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => { exportControllerRef.current?.abort() }, [sessionActor.session.userId])
  const [exportCode, setExportCode] = useState("")
  const [exportCodeVisible, setExportCodeVisible] = useState(false)
  const [isChangingPhone, setIsChangingPhone] = useState(false)
  const [phoneChangeVisible, setPhoneChangeVisible] = useState(false)
  const [phoneChangeStep, setPhoneChangeStep] = useState<"current_code" | "new_number" | "new_code">("current_code")
  const [currentPhoneCode, setCurrentPhoneCode] = useState("")
  const [newPhoneCountry, setNewPhoneCountry] = useState<PhoneCountryCode>("TR")
  const [newPhoneNumber, setNewPhoneNumber] = useState("")
  const [newPhoneCode, setNewPhoneCode] = useState("")
  const [currentPhoneConfirmationToken, setCurrentPhoneConfirmationToken] = useState("")
  const [matchingFilters, setMatchingFilters] = useState<DiscoveryFilters>(
    DEFAULT_DISCOVERY_FILTERS
  )
  const [matchingFiltersVisible, setMatchingFiltersVisible] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null)
  const [notificationPreferencesStatus, setNotificationPreferencesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [isSavingNotificationPreferences, setIsSavingNotificationPreferences] = useState(false)
  const analyticsConsent = useAnalyticsConsent()
  const newPhoneAnalysis = analyzeLocalPhoneNumber(newPhoneNumber, newPhoneCountry)
  const handleGoBack = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  useEffect(() => {
    let active = true
    if (sessionActor.session.mode === "production") {
      const preferences = sessionActor.profile.discoveryPreferences
      if (preferences && active) {
        setMatchingFilters(toDiscoveryFilters(preferences))
      }
      return () => {
        active = false
      }
    }
    void loadDiscoveryFilters(AsyncStorage, sessionActor.profile.userId).then(
      (filters) => {
        if (active) setMatchingFilters(filters)
      }
    )
    return () => {
      active = false
    }
  }, [sessionActor.profile.discoveryPreferences, sessionActor.profile.userId, sessionActor.session.mode])

  const loadNotificationPreferences = useCallback(async () => {
    if (sessionActor.session.mode !== "production") return
    setNotificationPreferencesStatus("loading")
    try {
      const preferences = await getNotificationPreferences(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      setNotificationPreferences(preferences)
      setNotificationPreferencesStatus("ready")
    } catch {
      setNotificationPreferencesStatus("error")
    }
  }, [sessionActor])

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    void loadNotificationPreferences()
  }, [loadNotificationPreferences, sessionActor.session.mode])

  const handleNotificationToggle = useCallback((key: NotificationPreferenceToggleKey, enabled: boolean) => {
    if (!notificationPreferences || isSavingNotificationPreferences || sessionActor.session.mode !== "production") return
    const previous = notificationPreferences
    const optimistic = updateNotificationPreferenceToggle(previous, key, enabled)
    setNotificationPreferences(optimistic)
    setIsSavingNotificationPreferences(true)
    void updateNotificationPreferences(
      MOBILE_HTTP_BASE_URL,
      sessionActor.session.sessionToken,
      { [key]: enabled }
    ).then((saved) => {
      setNotificationPreferences(saved)
    }).catch(() => {
      setNotificationPreferences(previous)
      showToast({
        title: "Notification setting not saved",
        body: "Try again in a moment.",
        type: "warning"
      })
    }).finally(() => {
      setIsSavingNotificationPreferences(false)
    })
  }, [isSavingNotificationPreferences, notificationPreferences, sessionActor])

  const handleRequestPushPermission = useCallback((): void => {
    if (props.pushPermissionStatus === "denied") {
      void Linking.openSettings().catch(() => {
        showToast({
          title: "System settings did not open",
          body: "Open your device settings and allow notifications for Blumi.",
          type: "warning"
        })
      })
      return
    }
    void props.onRequestPushPermission()
      .then(() => {
        showToast({
          title: "Device notifications updated",
          body: "You stay in control of which moments Blumi can send.",
          type: "success"
        })
      })
      .catch(() => {
        showToast({
          title: "Notifications not enabled",
          body: "You can try again here or update Blumi in system settings.",
          type: "warning"
        })
      })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [props.onRequestPushPermission, props.pushPermissionStatus])

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    void hydrateBlockedUsersFromServer(
      sessionActor.profile.userId,
      sessionActor.session.sessionToken
    )
      .catch((error) => {
        showToast({
          title: "Hidden list not refreshed",
        body: getSettingsActionErrorMessageForDisplay("refreshHiddenList", error, locale),
          type: "warning"
        })
      })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [sessionActor])
  const handleApplyMatchingFilters = useCallback((filters: DiscoveryFilters) => {
    const previous = matchingFilters
    setMatchingFilters(filters)
    setMatchingFiltersVisible(false)
    void (async () => {
      if (sessionActor.session.mode === "production") {
        await onUpdateProfile({
          displayName: sessionActor.profile.displayName,
          discoveryPreferences: toDiscoveryPreferences(
            filters,
            sessionActor.profile.discoveryPreferences
          )
        })
      }
      return persistDiscoveryFilters(AsyncStorage, sessionActor.profile.userId, filters)
    })().then(setMatchingFilters).catch(() => {
      setMatchingFilters(previous)
      showToast({
        title: "Preferences not saved",
        body: "Try again in a moment.",
        type: "warning"
      })
    })
  }, [matchingFilters, onUpdateProfile, sessionActor])
  const openLegal = useCallback(
    (type: "privacy" | "terms" | "guidelines") => {
      navigation.navigate("Legal", { type })
    },
    [navigation]
  )

  const deleteAccount = useCallback(async (confirmationToken: string): Promise<void> => {
    if (isDeletingAccount) return
    setIsDeletingAccount(true)
    try {
      if (sessionActor.session.mode === "production") {
        await deleteProductionAccount(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          confirmationToken
        )
      }
      await onResetSession()
      showToast({
        title: copy.deletedTitle,
        body: copy.deletedBody,
        type: "success"
      })
    } catch (error) {
      showToast({
        title: "Account not deleted",
        body: getSettingsActionErrorMessageForDisplay("deleteAccount", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [copy, isDeletingAccount, onResetSession, sessionActor])

  const requestDeletionCode = useCallback(async () => {
    if (isDeletingAccount || sessionActor.session.mode !== "production") {
      showToast({ title: copy.signInRequired, body: copy.signInBeforeDelete, type: "warning" })
      return
    }
    setIsDeletingAccount(true)
    try {
      await requestAccountDeletionChallenge(MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken)
      setDeletionCode("")
      setDeletionCodeVisible(true)
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestDeletionCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [isDeletingAccount, sessionActor])

  const verifyDeletionCode = useCallback(async () => {
    if (isDeletingAccount || sessionActor.session.mode !== "production") return
    setIsDeletingAccount(true)
    try {
      const confirmation = await verifyAccountDeletionCode(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { verificationCode: deletionCode }
      )
      setDeletionCodeVisible(false)
      Alert.alert(
        copy.deletePermanentlyTitle,
        copy.deletePermanentlyBody,
        [
          { text: copy.cancel, style: "cancel" },
          { text: copy.deletePermanently, style: "destructive", onPress: () => void deleteAccount(confirmation.confirmationToken) }
        ]
      )
    } catch (error) {
      showToast({
        ...getSettingsVerificationErrorToastForDisplay("verifyDeletionCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [deleteAccount, deletionCode, isDeletingAccount, sessionActor])

  const requestDataExport = useCallback(async () => {
    if (
      isExportingAccountData ||
      sessionActor.session.mode !== "production"
    ) {
      showToast({
        title: copy.signInRequired,
        body: copy.signInBeforeExport,
        type: "warning"
      })
      return
    }
    setIsExportingAccountData(true)
    try {
      await requestAccountDataExportChallenge(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      setExportCode("")
      setExportCodeVisible(true)
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestDataExport", error, locale),
        type: "warning"
      })
    } finally {
      setIsExportingAccountData(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [isExportingAccountData, sessionActor])

  const verifyExportCode = useCallback(async () => {
    if (
      isExportingAccountData ||
      sessionActor.session.mode !== "production"
    ) {
      return
    }
    const controller = new AbortController()
    exportControllerRef.current?.abort()
    exportControllerRef.current = controller
    setIsExportingAccountData(true)
    try {
      const confirmation = await verifyAccountDataExportCode(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        exportCode,
        undefined,
        controller.signal
      )
      const exported = await downloadAccountDataExport(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        confirmation.confirmationToken,
        undefined,
        controller.signal
      )
      if (controller.signal.aborted) { await exported.dispose(); return }
      await shareAccountDataExportFile(exported)
      if (controller.signal.aborted) return
      setExportCodeVisible(false)
      setExportCode("")
    } catch (error) {
      if (controller.signal.aborted) return
      showToast({
        title: copy.exportTitle,
        body: getSettingsActionErrorMessageForDisplay("verifyDataExport", error, locale),
        type: "warning"
      })
    } finally {
      if (exportControllerRef.current === controller) exportControllerRef.current = null
      setIsExportingAccountData(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [exportCode, isExportingAccountData, sessionActor])

  const resetPhoneChangeFlow = useCallback(() => {
    setPhoneChangeVisible(false)
    setPhoneChangeStep("current_code")
    setCurrentPhoneCode("")
    setNewPhoneCountry("TR")
    setNewPhoneNumber("")
    setNewPhoneCode("")
    setCurrentPhoneConfirmationToken("")
  }, [])

  const requestPhoneChangeCurrentCode = useCallback(async () => {
    if (isChangingPhone || sessionActor.session.mode !== "production") {
      showToast({
        title: copy.signInRequired,
        body: copy.signInBeforePhone,
        type: "warning"
      })
      return
    }
    setIsChangingPhone(true)
    try {
      await requestPhoneChangeCurrentChallenge(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      setPhoneChangeVisible(true)
      setPhoneChangeStep("current_code")
      setCurrentPhoneCode("")
      setNewPhoneCountry("TR")
      setNewPhoneNumber("")
      setNewPhoneCode("")
      setCurrentPhoneConfirmationToken("")
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestCurrentPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [isChangingPhone, sessionActor])

  const verifyCurrentPhoneChangeCode = useCallback(async () => {
    if (isChangingPhone || sessionActor.session.mode !== "production") return
    setIsChangingPhone(true)
    try {
      const confirmation = await verifyPhoneChangeCurrentCode(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        currentPhoneCode
      )
      setCurrentPhoneConfirmationToken(confirmation.confirmationToken)
      setPhoneChangeStep("new_number")
      setCurrentPhoneCode("")
    } catch (error) {
      showToast({
        ...getSettingsVerificationErrorToastForDisplay("verifyCurrentPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [currentPhoneCode, isChangingPhone, sessionActor])

  const requestPhoneChangeNewCode = useCallback(async () => {
    if (
      isChangingPhone ||
      sessionActor.session.mode !== "production" ||
      !currentPhoneConfirmationToken
    ) {
      return
    }
    setIsChangingPhone(true)
    try {
      await requestPhoneChangeNewNumberChallenge(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        newPhoneAnalysis.normalizedPhoneNumber,
        currentPhoneConfirmationToken
      )
      setPhoneChangeStep("new_code")
      setNewPhoneCode("")
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestNewPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [currentPhoneConfirmationToken, isChangingPhone, newPhoneAnalysis.normalizedPhoneNumber, sessionActor])

  const verifyNewPhoneChangeCode = useCallback(async () => {
    if (
      isChangingPhone ||
      sessionActor.session.mode !== "production" ||
      !currentPhoneConfirmationToken
    ) {
      return
  }
  setIsChangingPhone(true)
  try {
    let next: Awaited<ReturnType<typeof verifyPhoneChangeNewNumberCode>>
    try {
      next = await verifyPhoneChangeNewNumberCode(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        newPhoneCode
      )
    } catch (error) {
      showToast({
        ...getSettingsVerificationErrorToastForDisplay("verifyNewPhoneCode", error, locale),
        type: "warning"
      })
      return
    }

    try {
      await confirmPhoneChange(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        currentPhoneConfirmationToken,
        next.confirmationToken
      )
    } catch (error) {
      showToast({
        title: copy.changePhone,
        body: getSettingsActionErrorMessageForDisplay("confirmPhoneChange", error, locale),
        type: "warning"
      })
      return
    }

      resetPhoneChangeFlow()
      await onResetSession()
      showToast({
        title: copy.changePhone,
        body: copy.signOutBody,
        type: "success"
      })
    } finally {
      setIsChangingPhone(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    currentPhoneConfirmationToken,
    isChangingPhone,
    newPhoneCode,
    onResetSession,
    resetPhoneChangeFlow,
    sessionActor
  ])

  const handleUnblock = useCallback(
    (userId: string) => {
      Alert.alert(
        copy.showAgainTitle,
        copy.showAgainBody,
        [
          { text: copy.cancel, style: "cancel" },
          {
            text: copy.showAgain,
            style: "destructive",
            onPress: () => {
              if (sessionActor.session.mode !== "production") {
                unblockUser(userId)
                showToast({ title: copy.personVisibleAgain, type: "info" })
                return
              }
              void unblockSafetyUser(
                MOBILE_HTTP_BASE_URL,
                sessionActor.session.sessionToken,
                userId
              )
                .then(() => {
                  unblockUser(userId, { persist: false })
                  void hydrateBlockedUsersFromServer(
                    sessionActor.profile.userId,
                    sessionActor.session.sessionToken
                  ).catch(() => undefined)
                  showToast({ title: copy.personVisibleAgain, type: "info" })
                })
                .catch((error) => {
                  showToast({
                    title: "Could not update safety list",
                    body: getSettingsActionErrorMessageForDisplay("unblockPerson", error, locale),
                    type: "warning"
                  })
                })
            }
          }
        ]
      )
    },
    [copy, locale, sessionActor, unblockUser]
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
  const handleDeleteAccountPrompt = useCallback(() => {
    Alert.alert(
      copy.deleteAccount,
      copy.deleteAccountPromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isDeletingAccount ? copy.sending : copy.sendDeletionCode,
          style: "destructive",
          onPress: () => {
            void requestDeletionCode()
          }
        }
      ]
    )
  }, [copy, isDeletingAccount, requestDeletionCode])
  const handleDataExportPrompt = useCallback(() => {
    Alert.alert(
      copy.downloadData,
      copy.dataExportPromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isExportingAccountData ? copy.sending : copy.sendExportCode,
          onPress: () => {
            void requestDataExport()
          }
        }
      ]
    )
  }, [copy, isExportingAccountData, requestDataExport])
  const handlePhoneChangePrompt = useCallback(() => {
    Alert.alert(
      copy.changePhone,
      copy.phoneChangePromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isChangingPhone ? copy.sending : copy.sendSecurityCode,
          onPress: () => {
            void requestPhoneChangeCurrentCode()
          }
        }
      ]
    )
  }, [copy, isChangingPhone, requestPhoneChangeCurrentCode])
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

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionOverline}>{copy.matching}</Text>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="heart"
                iconColors={uiTheme.gradients.primary}
                label={copy.discoveryPreferences}
                value={formatDiscoveryFiltersSummary(matchingFilters)}
                chevron
                isLast
                onPress={() => setMatchingFiltersVisible(true)}
              />
            </View>
            <Text style={styles.privacyNote}>
              {copy.discoveryNote}
            </Text>
          </View>

          {sessionActor.session.mode === "production" ? (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionOverline}>{copy.notifications}</Text>
              <View style={styles.sectionCard}>
                {props.pushPermissionStatus !== "granted" ? (
                  <SettingsRow
                    icon="notifications"
                    iconColors={uiTheme.gradients.primary}
                    label={
                      props.pushPermissionStatus === "denied"
                        ? copy.openNotificationSettings
                        : copy.enableNotifications
                    }
                    description={copy.notificationDescription}
                    value={
                      props.isRequestingPushPermission
                        ? copy.opening
                        : copy.enable
                    }
                    chevron
                    onPress={
                      props.isRequestingPushPermission
                        ? undefined
                        : handleRequestPushPermission
                    }
                  />
                ) : null}
                {notificationPreferencesStatus === "loading" || notificationPreferencesStatus === "idle" ? (
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
                  NOTIFICATION_PREFERENCE_ROWS.map((row, index) => (
                    <SettingsRow
                      key={row.key}
                      icon={row.key === "likesEnabled" ? "heart" : row.key === "messagesEnabled" ? "chatbubble" : row.key === "matchesEnabled" ? "people" : "compass"}
                      iconColors={row.key === "messagesEnabled" ? uiTheme.gradients.cool : uiTheme.gradients.primary}
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
                  ))
                ) : null}
              </View>
              <Text style={styles.privacyNote}>
                {copy.notificationNote}
              </Text>
            </View>
          ) : null}

          {/* ── Safety / Hidden people ────────────────────── */}
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
                    onUnblock={handleUnblock}
                  />
                ))
              )}
            </View>
          </View>

          {/* ── About ─────────────────────────────────────── */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionOverline}>{copy.privacy}</Text>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="analytics"
                iconColors={uiTheme.gradients.cool}
                label={copy.analytics}
                value={analyticsConsent.consent === "granted" ? copy.on : copy.off}
                isLast
              >
                <Switch
                  accessibilityRole="switch"
                  accessibilityLabel={copy.analytics}
                  accessibilityState={{
                    checked: analyticsConsent.consent === "granted",
                    disabled: !analyticsConsent.hydrated
                  }}
                  disabled={!analyticsConsent.hydrated}
                  value={analyticsConsent.consent === "granted"}
                  onValueChange={(enabled) => {
                    void analyticsConsent.setEnabled(enabled).catch(() => {
                      showToast({
                        title: copy.privacyNotSaved,
                        body: copy.tryAgain,
                        type: "warning"
                      })
                    })
                  }}
                  trackColor={{ false: "#E6DCE4", true: "#FF9BC5" }}
                  thumbColor="#FFFFFF"
                />
              </SettingsRow>
            </View>
            <Text style={styles.privacyNote}>
              {copy.analyticsNote}
            </Text>
          </View>

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionOverline}>{copy.about}</Text>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="phone-portrait"
                iconColors={uiTheme.gradients.primary}
                label={copy.version}
                value={VERSION_LABEL}
              />
              <SettingsRow
                icon="sparkles"
                iconColors={uiTheme.gradients.warm}
                label={copy.philosophy}
                value={copy.philosophyValue}
                isLast
              />
            </View>
          </View>

          {/* ── Legal ─────────────────────────────────────── */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionOverline}>{copy.legal}</Text>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="lock-closed"
                iconColors={["#9B59B6", "#C39BD3"]}
                label={copy.privacyPolicy}
                chevron
                onPress={handleOpenPrivacy}
              />
              <SettingsRow
                icon="document-text"
                iconColors={["#3498DB", "#85C1E9"]}
                label={copy.terms}
                chevron
                onPress={handleOpenTerms}
              />
              <SettingsRow
                icon="chatbubble-ellipses"
                iconColors={["#3AC08A", "#82E0AA"]}
                label={copy.communityGuidelines}
                chevron
                isLast
                onPress={handleOpenGuidelines}
              />
            </View>
          </View>

          {/* ── Account ──────────────────────────────────── */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionOverline}>{copy.account}</Text>
            <View style={styles.sectionCard}>
              <SettingsRow
                icon="download-outline"
                iconColors={uiTheme.gradients.cool}
                label={copy.downloadData}
                chevron
                onPress={handleDataExportPrompt}
              />
              <SettingsRow
                icon="call-outline"
                iconColors={uiTheme.gradients.warm}
                label={copy.changePhone}
                chevron
                onPress={handlePhoneChangePrompt}
              />
              <SettingsRow
                icon="log-out"
                iconColors={["#7F8C8D", "#BDC3C7"]}
                label={copy.signOut}
                chevron
                onPress={handleSignOutPrompt}
              />
              <SettingsRow
                icon="trash"
                iconColors={["#E74C3C", "#F1948A"]}
                label={copy.deleteAccount}
                chevron
                isLast
                onPress={handleDeleteAccountPrompt}
              />
            </View>
          </View>

          {/* ── Footer ────────────────────────────────────── */}
          <View style={styles.footerWrap}>
            <Text style={styles.footerTagline}>
              {copy.tagline}
            </Text>
            <Text style={styles.footerVersion}>Blumi {VERSION_LABEL}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      <DiscoverFiltersBottomSheet
        visible={matchingFiltersVisible}
        initialFilters={matchingFilters}
        onClose={() => setMatchingFiltersVisible(false)}
        onApply={handleApplyMatchingFilters}
      />
      <Modal
        visible={exportCodeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportCodeVisible(false)}
      >
        <View style={styles.deletionModalBackdrop}>
          <View style={styles.deletionModalCard}>
            <Text style={styles.deletionModalTitle}>{copy.exportTitle}</Text>
            <Text style={styles.deletionModalBody}>
              {copy.exportBody}
            </Text>
            <TextInput
              accessibilityLabel={copy.exportCode}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setExportCode(value.replace(/\D/g, ""))}
              placeholder="000000"
              style={styles.deletionCodeInput}
              value={exportCode}
            />
            <View style={styles.deletionModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.cancelExport}
                onPress={() => setExportCodeVisible(false)}
                style={styles.deletionSecondaryButton}
              >
                <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.verifyExport}
                disabled={exportCode.length !== 6 || isExportingAccountData}
                onPress={() => void verifyExportCode()}
                style={[styles.deletionPrimaryButton, exportCode.length !== 6 || isExportingAccountData ? styles.deletionButtonDisabled : null]}
              >
                <Text style={styles.deletionPrimaryText}>{isExportingAccountData ? copy.preparing : copy.continue}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={phoneChangeVisible}
        transparent
        animationType="fade"
        onRequestClose={resetPhoneChangeFlow}
      >
        <View style={styles.deletionModalBackdrop}>
          <View style={styles.deletionModalCard}>
            <Text style={styles.deletionModalTitle}>
              {phoneChangeStep === "current_code"
                ? copy.currentPhoneTitle
                : phoneChangeStep === "new_number"
                  ? copy.newPhoneTitle
                  : copy.verifyNewPhoneTitle}
            </Text>
            <Text style={styles.deletionModalBody}>
              {phoneChangeStep === "current_code"
                ? copy.currentPhoneBody
                : phoneChangeStep === "new_number"
                  ? copy.newPhoneBody
                  : copy.verifyNewPhoneBody}
            </Text>
            {phoneChangeStep === "new_number" ? (
              <View style={styles.phoneChangeControl}>
                <CountryCallingCodePicker
                  disabled={isChangingPhone}
                  selectedCountry={newPhoneCountry}
                  onSelect={(countryCode) => {
                    setNewPhoneCountry(countryCode)
                    setNewPhoneNumber("")
                  }}
                />
                <View style={styles.phoneChangeDivider} />
                <TextInput
                  accessibilityLabel={copy.newPhoneInput}
                  autoCapitalize="none"
                  autoComplete="tel"
                  autoCorrect={false}
                  editable={!isChangingPhone}
                  keyboardType="phone-pad"
                  maxLength={24}
                  onChangeText={(value) => {
                    setNewPhoneNumber(formatLocalPhoneNumber(value, newPhoneCountry))
                  }}
                  placeholder={getLocalPhonePlaceholder(newPhoneCountry, copy.localPhonePlaceholder)}
                  style={styles.phoneChangeInput}
                  textContentType="telephoneNumber"
                  value={newPhoneNumber}
                />
              </View>
            ) : (
              <TextInput
                accessibilityLabel={phoneChangeStep === "current_code" ? copy.currentPhoneCode : copy.newPhoneCode}
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={(value) => {
                  const sanitized = value.replace(/\D/g, "")
                  if (phoneChangeStep === "current_code") {
                    setCurrentPhoneCode(sanitized)
                    return
                  }
                  setNewPhoneCode(sanitized)
                }}
                placeholder="000000"
                style={styles.deletionCodeInput}
                value={phoneChangeStep === "current_code" ? currentPhoneCode : newPhoneCode}
              />
            )}
            <View style={styles.deletionModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.cancelPhoneChange}
                onPress={resetPhoneChangeFlow}
                style={styles.deletionSecondaryButton}
              >
                <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  phoneChangeStep === "current_code"
                    ? copy.verifyCurrentCode
                    : phoneChangeStep === "new_number"
                      ? copy.sendCodeToNewPhone
                      : copy.finishPhoneChange
                }
                disabled={
                  isChangingPhone ||
                  (phoneChangeStep === "current_code" && currentPhoneCode.length !== 6) ||
                  (phoneChangeStep === "new_number" && !newPhoneAnalysis.valid) ||
                  (phoneChangeStep === "new_code" && newPhoneCode.length !== 6)
                }
                onPress={() => {
                  if (phoneChangeStep === "current_code") {
                    void verifyCurrentPhoneChangeCode()
                    return
                  }
                  if (phoneChangeStep === "new_number") {
                    void requestPhoneChangeNewCode()
                    return
                  }
                  void verifyNewPhoneChangeCode()
                }}
                style={[
                  styles.deletionPrimaryButton,
                  (
                    isChangingPhone ||
                    (phoneChangeStep === "current_code" && currentPhoneCode.length !== 6) ||
                    (phoneChangeStep === "new_number" && !newPhoneAnalysis.valid) ||
                    (phoneChangeStep === "new_code" && newPhoneCode.length !== 6)
                  )
                    ? styles.deletionButtonDisabled
                    : null
                ]}
              >
                <Text style={styles.deletionPrimaryText}>
                  {isChangingPhone
                    ? phoneChangeStep === "new_code"
                      ? copy.finishing
                      : copy.checking
                    : phoneChangeStep === "new_number"
                      ? copy.sendCode
                      : phoneChangeStep === "new_code"
                        ? copy.finish
                        : copy.continue}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={deletionCodeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletionCodeVisible(false)}
      >
        <View style={styles.deletionModalBackdrop}>
          <View style={styles.deletionModalCard}>
            <Text style={styles.deletionModalTitle}>{copy.deletionCodeTitle}</Text>
            <Text style={styles.deletionModalBody}>
              {copy.deletionCodeBody}
            </Text>
            <TextInput
              accessibilityLabel={copy.deletionCode}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setDeletionCode(value.replace(/\D/g, ""))}
              placeholder="000000"
              style={styles.deletionCodeInput}
              value={deletionCode}
            />
            <View style={styles.deletionModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.cancelDeletion}
                onPress={() => setDeletionCodeVisible(false)}
                style={styles.deletionSecondaryButton}
              >
                <Text style={styles.deletionSecondaryText}>{copy.cancel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.verifyDeletion}
                disabled={deletionCode.length !== 6 || isDeletingAccount}
                onPress={() => void verifyDeletionCode()}
                style={[styles.deletionPrimaryButton, deletionCode.length !== 6 || isDeletingAccount ? styles.deletionButtonDisabled : null]}
              >
                <Text style={styles.deletionPrimaryText}>{isDeletingAccount ? copy.checking : copy.continue}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const BlockedUserRow = memo(function BlockedUserRow(props: {
  isLast: boolean
  onUnblock: (userId: string) => void
  userId: string
  profile?: { displayName: string; avatarPresetId?: string }
}) {
  const { isLast, onUnblock, profile, userId } = props

  return (
    <View
      style={[
        styles.blockedCard,
        !isLast ? styles.rowDivider : null
      ]}
    >
      <Avatar
        name={profile?.displayName ?? "?"}
        seed={profile?.avatarPresetId ?? userId}
        size={40}
        ring="soft"
      />
      <View style={styles.blockedBody}>
        <Text style={styles.blockedId} numberOfLines={1}>
          {profile?.displayName ?? "Hidden profile"}
        </Text>
        <Text style={styles.blockedLabel}>Hidden from you</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show blocked user ${userId.slice(0, 12)}`}
        onPress={() => onUnblock(userId)}
        style={({ pressed }) => [
          styles.unblockButton,
          pressed ? { opacity: 0.85 } : null
        ]}
      >
        <Text style={styles.unblockText}>Show</Text>
      </Pressable>
    </View>
  )
}, (previous, next) =>
  previous.isLast === next.isLast &&
  previous.onUnblock === next.onUnblock &&
  previous.userId === next.userId &&
  previous.profile?.displayName === next.profile?.displayName &&
  previous.profile?.avatarPresetId === next.profile?.avatarPresetId
)

/* ── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm
  },
  scroll: {
    gap: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.xxl
  },

  /* ── Section ────────────────────────────────────── */
  sectionWrap: {
    gap: uiTheme.spacing.xs
  },
  sectionOverline: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    paddingLeft: uiTheme.spacing.xxs,
    marginBottom: 2
  },
  sectionCard: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    overflow: "hidden",
    ...uiTheme.shadow.soft
  },
  privacyNote: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: uiTheme.spacing.xs
  },
  deletionModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: uiTheme.spacing.lg,
    backgroundColor: "rgba(32, 20, 30, 0.48)"
  },
  deletionModalCard: {
    width: "100%",
    borderRadius: uiTheme.radius.xl,
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.sm,
    backgroundColor: uiTheme.colors.background
  },
  deletionModalTitle: { ...uiTheme.font.heading, color: uiTheme.colors.textPrimary },
  deletionModalBody: { ...uiTheme.font.bodySmall, color: uiTheme.colors.textSecondary, lineHeight: 20 },
  deletionCodeInput: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    letterSpacing: 8,
    textAlign: "center",
    borderWidth: 1,
    borderColor: uiTheme.colors.divider,
    borderRadius: uiTheme.radius.md,
    paddingVertical: uiTheme.spacing.sm
  },
  phoneChangeControl: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: uiTheme.colors.divider,
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.surface,
    overflow: "hidden"
  },
  phoneChangeDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: uiTheme.colors.divider
  },
  phoneChangeInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: uiTheme.spacing.sm,
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary
  },
  deletionModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: uiTheme.spacing.sm },
  deletionSecondaryButton: { paddingHorizontal: uiTheme.spacing.md, paddingVertical: uiTheme.spacing.sm },
  deletionSecondaryText: { ...uiTheme.font.label, color: uiTheme.colors.textSecondary },
  deletionPrimaryButton: { borderRadius: uiTheme.radius.full, paddingHorizontal: uiTheme.spacing.md, paddingVertical: uiTheme.spacing.sm, backgroundColor: uiTheme.colors.danger },
  deletionButtonDisabled: { opacity: 0.45 },
  deletionPrimaryText: { ...uiTheme.font.label, color: "#FFFFFF" },

  /* ── Row ─────────────────────────────────────────── */
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    gap: uiTheme.spacing.sm
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiTheme.colors.divider
  },
  rowBody: {
    flex: 1
  },
  rowLabel: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary
  },
  rowDescription: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted,
    marginTop: 2
  },
  rowValue: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  /* ── Icon Circle ─────────────────────────────────── */
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: "hidden"
  },
  iconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  /* ── Empty state ─────────────────────────────────── */
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.md
  },
  emptyText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    flex: 1,
    lineHeight: 20
  },

  /* ── Blocked card ────────────────────────────────── */
  blockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm
  },
  blockedBody: {
    flex: 1,
    gap: 2
  },
  blockedId: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary
  },
  blockedLabel: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.danger
  },
  unblockButton: {
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: uiTheme.colors.danger
  },
  unblockText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk
  },

  /* ── Footer ──────────────────────────────────────── */
  footerWrap: {
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingVertical: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md
  },
  footerTagline: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    textAlign: "center",
    lineHeight: 20
  },
  footerVersion: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted,
    opacity: 0.6
  }
})
