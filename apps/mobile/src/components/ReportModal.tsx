import { useCallback, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import type { ReportReason } from "@blumi/contracts"
import {
  blockUser,
  hydrateBlockedUsersFromServer,
  submitReport
} from "../features/safety/blockStore"
import { blockSafetyUser, reportSafetyUser } from "../features/safety/safetyApi"
import type { SessionActor } from "../features/session/sessionModel"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import { hapticMedium, hapticStrong } from "../ui/haptics"
import { showToast } from "../ui/toast"
import { uiTheme } from "../ui/theme"
import { captureProductEvent } from "../analytics/productAnalytics"
import { getNativeAppLocale } from "../features/session/authLocale"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getReportModalCopy } from "../features/safety/reportModalCopy"

interface ReportModalProps {
  visible: boolean
  targetUserId: string
  targetDisplayName: string
  sessionActor: SessionActor
  onClose: () => void
  onActionComplete?: () => void
}

const REASONS: {
  key: ReportReason
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { key: "inappropriate", icon: "warning-outline" },
  { key: "harassment", icon: "hand-left-outline" },
  { key: "spam", icon: "alert-circle-outline" },
  { key: "fake_profile", icon: "person-outline" },
  { key: "fake_or_bot", icon: "hardware-chip-outline" },
  { key: "underage", icon: "shield-half-outline" },
  { key: "other", icon: "ellipsis-horizontal" }
]

const MAX_REPORT_DETAILS_LENGTH = 280

function createReportIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID()
  }
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

export function ReportModal(props: ReportModalProps) {
  const {
    visible,
    targetUserId,
    targetDisplayName,
    sessionActor,
    onClose,
    onActionComplete
  } = props
  const copy = getReportModalCopy(
    resolveAccountRecoveryLocale(
      getNativeAppLocale(),
      Intl.DateTimeFormat().resolvedOptions().locale
    )
  )
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [step, setStep] = useState<"reason" | "confirm" | "done">("reason")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const reportIdempotencyKeyRef = useRef<string | null>(null)

  const handleSelectReason = useCallback((reason: ReportReason) => {
    setSelectedReason(reason)
    reportIdempotencyKeyRef.current = null
    hapticMedium()
    setStep("confirm")
  }, [])

  const handleBlock = useCallback(() => {
    if (isSubmitting) return
    setIsSubmitting(true)
    void (async () => {
      try {
        if (sessionActor.session.mode === "production") {
          await blockSafetyUser(
            MOBILE_HTTP_BASE_URL,
            sessionActor.session.sessionToken,
            targetUserId
          )
        }
        blockUser(sessionActor.profile.userId, targetUserId, {
          persist: sessionActor.session.mode !== "production"
        })
        if (sessionActor.session.mode === "production") {
          void hydrateBlockedUsersFromServer(
            sessionActor.profile.userId,
            sessionActor.session.sessionToken
          ).catch(() => undefined)
        }
        captureProductEvent("safety_action_completed", {
          action: "block",
          mode: sessionActor.session.mode
        })
        hapticStrong()
        showToast({ title: copy.hiddenToast(targetDisplayName), type: "info" })
        onClose()
        resetState()
        onActionComplete?.()
      } catch {
        showToast({
          title: copy.couldNotHide,
          body: copy.tryAgain,
          type: "warning"
        })
      } finally {
        setIsSubmitting(false)
      }
    })()
  }, [copy, isSubmitting, onActionComplete, onClose, sessionActor, targetDisplayName, targetUserId])

  const handleReportAndBlock = useCallback(() => {
    if (!selectedReason || isSubmitting) return
    setIsSubmitting(true)
    void (async () => {
      try {
        const normalizedDetails = details.trim().replace(/\s+/g, " ")
        if (sessionActor.session.mode === "production") {
          const idempotencyKey =
            reportIdempotencyKeyRef.current ?? createReportIdempotencyKey()
          reportIdempotencyKeyRef.current = idempotencyKey
          await reportSafetyUser(
            MOBILE_HTTP_BASE_URL,
            sessionActor.session.sessionToken,
            {
              reportedUserId: targetUserId,
              reason: selectedReason,
              ...(normalizedDetails ? { note: normalizedDetails } : {}),
              idempotencyKey
            }
          )
          blockUser(sessionActor.profile.userId, targetUserId, { persist: false })
          void hydrateBlockedUsersFromServer(
            sessionActor.profile.userId,
            sessionActor.session.sessionToken
          ).catch(() => undefined)
        } else {
          submitReport(sessionActor.profile.userId, {
            targetUserId,
            reason: selectedReason,
            ...(normalizedDetails ? { details: normalizedDetails } : {})
          })
        }
        captureProductEvent("safety_action_completed", {
          action: "report_and_block",
          reason: selectedReason,
          mode: sessionActor.session.mode
        })
        hapticStrong()
        showToast({
          title: copy.thankYouToast,
          body: copy.hiddenToast(targetDisplayName),
          type: "success"
        })
        setStep("done")
        setTimeout(() => {
          onClose()
          resetState()
          onActionComplete?.()
        }, 800)
      } catch {
        showToast({
          title: copy.reportNotSent,
          body: copy.tryAgain,
          type: "warning"
        })
      } finally {
        setIsSubmitting(false)
      }
    })()
  }, [copy, details, isSubmitting, onActionComplete, onClose, selectedReason, sessionActor, targetDisplayName, targetUserId])

  const resetState = () => {
    setSelectedReason(null)
    setDetails("")
    setStep("reason")
    setIsSubmitting(false)
    reportIdempotencyKeyRef.current = null
  }

  const handleClose = useCallback(() => {
    if (isSubmitting) return
    onClose()
    resetState()
  }, [isSubmitting, onClose])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>
              {copy.title(targetDisplayName, step)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.closeAccessibilityLabel}
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={handleClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={uiTheme.colors.textMuted} />
            </Pressable>
          </View>

          {step === "reason" ? (
            <View style={styles.body}>
              <Text style={styles.subtitle}>
                {copy.reasonSubtitle}
              </Text>
              {REASONS.map((r) => {
                const reasonLabel = copy.reasonLabel(r.key)
                return (
                <Pressable
                  key={r.key}
                  accessibilityRole="button"
                  accessibilityLabel={copy.reportReasonAccessibilityLabel(reasonLabel)}
                  accessibilityState={{ disabled: isSubmitting }}
                  disabled={isSubmitting}
                  style={({ pressed }) => [
                    styles.reasonCard,
                    pressed ? styles.reasonCardPressed : null
                  ]}
                  onPress={() => {
                    if (!isSubmitting) handleSelectReason(r.key)
                  }}
                >
                  <Ionicons
                    accessible={false}
                    name={r.icon}
                    size={18}
                    color={uiTheme.colors.primaryDeep}
                  />
                  <Text style={styles.reasonLabel}>{reasonLabel}</Text>
                  <Ionicons
                    accessible={false}
                    name="chevron-forward"
                    size={19}
                    color={uiTheme.colors.textMuted}
                  />
                </Pressable>
                )
              })}

              <View style={styles.divider} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.hideAccessibilityLabel(targetDisplayName)}
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.blockOnlyButton,
                  pressed ? { opacity: 0.85 } : null
                ]}
                onPress={handleBlock}
              >
                <Text style={styles.blockOnlyText}>
                  {isSubmitting ? copy.hiding : copy.hideWithoutReporting}
                </Text>
              </Pressable>
            </View>
          ) : step === "confirm" ? (
            <View style={styles.body}>
              <Text style={styles.subtitle}>
                {copy.confirmBody(targetDisplayName)}
              </Text>
              <TextInput
                accessibilityLabel={copy.detailsAccessibilityLabel}
                value={details}
                onChangeText={setDetails}
                placeholder={copy.detailsPlaceholder}
                placeholderTextColor={uiTheme.colors.textMuted}
                maxLength={MAX_REPORT_DETAILS_LENGTH}
                multiline
                style={styles.detailsInput}
                textAlignVertical="top"
              />
              <Text style={styles.detailsCounter}>
                {details.length}/{MAX_REPORT_DETAILS_LENGTH}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.reportAndHideAccessibilityLabel(targetDisplayName)}
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.reportButton,
                  pressed ? { opacity: 0.88 } : null
                ]}
                onPress={handleReportAndBlock}
              >
                <Text style={styles.reportButtonText}>
                  {isSubmitting ? copy.sending : copy.reportAndHide}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.goBackAccessibilityLabel}
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
                onPress={() => setStep("reason")}
                hitSlop={8}
              >
                <View style={styles.backLinkRow}>
                  <Ionicons name="arrow-back" size={16} color={uiTheme.colors.textMuted} />
                  <Text style={styles.backLink}>{copy.goBack}</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={styles.body}>
              <Ionicons
                accessible={false}
                name="checkmark-circle"
                size={48}
                color={uiTheme.colors.successInk}
                style={styles.doneIcon}
              />
              <Text style={styles.doneText}>
                {copy.doneMessage}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(35, 18, 42, 0.24)"
  },
  sheet: {
    borderTopLeftRadius: uiTheme.radius.xxl,
    borderTopRightRadius: uiTheme.radius.xxl,
    backgroundColor: "rgba(255, 250, 253, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.80)",
    paddingBottom: 40,
    ...uiTheme.shadow.card
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.sm
  },
  handle: {
    position: "absolute",
    top: 8,
    left: "50%",
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: uiTheme.colors.border
  },
  title: {
    flex: 1,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading,
    fontWeight: "800"
  },
  body: {
    paddingHorizontal: uiTheme.spacing.lg,
    gap: uiTheme.spacing.sm
  },
  subtitle: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall,
    lineHeight: 21,
    marginBottom: uiTheme.spacing.xs
  },
  reasonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingVertical: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: "rgba(255, 255, 255, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.74)"
  },
  reasonCardPressed: {
    backgroundColor: uiTheme.colors.chipBackground
  },
  reasonLabel: {
    flex: 1,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodySmall,
    fontWeight: "700"
  },
  divider: {
    height: 1,
    backgroundColor: uiTheme.colors.border,
    marginVertical: uiTheme.spacing.xs
  },
  blockOnlyButton: {
    alignSelf: "center",
    paddingHorizontal: uiTheme.spacing.xl,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: uiTheme.colors.border
  },
  blockOnlyText: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall,
    fontWeight: "700"
  },
  detailsInput: {
    minHeight: 86,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.78)",
    backgroundColor: "rgba(255, 255, 255, 0.52)",
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodySmall
  },
  detailsCounter: {
    alignSelf: "flex-end",
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.micro,
    marginTop: -uiTheme.spacing.xs
  },
  reportButton: {
    alignSelf: "stretch",
    paddingVertical: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.danger,
    alignItems: "center"
  },
  reportButtonText: {
    color: "#FFFFFF",
    ...uiTheme.font.body,
    fontWeight: "800"
  },
  backLink: {
    color: uiTheme.colors.textMuted,
    ...uiTheme.font.bodySmall,
    fontWeight: "600"
  },
  backLinkRow: {
    alignSelf: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: uiTheme.spacing.xxs,
    paddingVertical: uiTheme.spacing.xs
  },
  doneIcon: {
    alignSelf: "center",
    marginVertical: uiTheme.spacing.md
  },
  doneText: {
    alignSelf: "center",
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.body,
    fontWeight: "700",
    textAlign: "center"
  }
})
