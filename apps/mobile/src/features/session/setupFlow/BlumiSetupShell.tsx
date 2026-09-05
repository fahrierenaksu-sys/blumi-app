import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { SoftBlobBackground } from "../../../ui/backgrounds"
import { useReducedMotion } from "../../../ui/animations"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { SetupFlowHeader } from "./SetupFlowHeader"
import { SetupFlowMotionSwap } from "./SetupFlowMotionSwap"
import { SetupFlowPrimaryAction } from "./SetupFlowPrimaryAction"
import { ONBOARDING_PRIMARY_ACTION_LAYOUT } from "../onboardingActionLayout"
import { SetupFlowProgress } from "./SetupFlowProgress"
import { SetupFlowStage } from "./SetupFlowStage"
import { SetupFlowTaskCard } from "./SetupFlowTaskCard"
import {
  SETUP_FLOW_COPY,
  getSetupLayoutMetrics,
  getSetupProgress,
  type PreAuthSetupStep
} from "./setupFlowShellModel"

interface BlumiSetupShellProps {
  step: PreAuthSetupStep
  stage: ReactNode
  children?: ReactNode
  onBack: () => void
  onPrimaryAction: () => void
  title?: string
  description?: string
  primaryActionLabel?: string
  primaryActionDisabled?: boolean
  primaryActionBusy?: boolean
  backDisabled?: boolean
  feedback?: ReactNode
  stageInteractive?: boolean
  stageHeight?: number
  reduceMotion?: boolean
  motionActive?: boolean
  primaryActionTestID?: string
  taskCardTone?: "default" | "liquid" | "sheet"
  taskCardMinHeight?: number
  taskCardOffsetY?: number
  headingOffsetY?: number
  immersiveBottomSheet?: boolean
  hideTaskCard?: boolean
  hideHeading?: boolean
  hideProgressRail?: boolean
  headerTitle?: string
  headerProgressStyle?: "fraction" | "dots"
  collapseStageOnKeyboard?: boolean
  collapseHeadingOnKeyboard?: boolean
  scrollBottomInset?: number
  testID?: string
}

export function BlumiSetupShell({
  step,
  stage,
  children,
  onBack,
  onPrimaryAction,
  title,
  description,
  primaryActionLabel,
  primaryActionDisabled = false,
  primaryActionBusy = false,
  backDisabled = false,
  feedback,
  stageInteractive = false,
  stageHeight,
  reduceMotion: reduceMotionOverride,
  motionActive = true,
  primaryActionTestID,
  taskCardTone = "default",
  taskCardMinHeight,
  taskCardOffsetY = 0,
  headingOffsetY = 0,
  immersiveBottomSheet = false,
  hideTaskCard = false,
  hideHeading = false,
  hideProgressRail = false,
  headerTitle,
  headerProgressStyle,
  collapseStageOnKeyboard = false,
  collapseHeadingOnKeyboard = false,
  scrollBottomInset,
  testID = "blumi-setup-shell"
}: BlumiSetupShellProps) {
  const systemReduceMotion = useReducedMotion()
  const reduceMotion = reduceMotionOverride ?? systemReduceMotion
  const { width, height, fontScale } = useWindowDimensions()
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const scrollRef = useRef<ScrollView | null>(null)
  const metrics = useMemo(
    () => getSetupLayoutMetrics({ width, height, fontScale }),
    [fontScale, height, width]
  )
  const progress = getSetupProgress(step)
  const copy = SETUP_FLOW_COPY[step]

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true))
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false))
    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  const effectiveTitle = title ?? copy.title
  const effectiveDescription = description ?? copy.description
  const effectiveActionLabel = primaryActionLabel ?? copy.primaryAction
  const stageCollapsed = collapseStageOnKeyboard && keyboardVisible
  const headingCollapsed = collapseHeadingOnKeyboard && keyboardVisible
  const keyboardBottomPadding =
    metrics.primaryActionHeight + uiTheme.spacing.xl + uiTheme.spacing.md
  const scrollContentBottomPadding = keyboardVisible
    ? keyboardBottomPadding
    : scrollBottomInset ?? keyboardBottomPadding
  const scrollContentTopPadding = keyboardVisible ? 0 : uiTheme.spacing.sm

  useEffect(() => {
    if (!stageCollapsed) return
    const animationFrame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    })
    return () => cancelAnimationFrame(animationFrame)
  }, [stageCollapsed])

  useLayoutEffect(() => {
    if (!motionActive) return
    // Setup layers stay mounted to make forward transitions cheap. Reset the
    // reactivated layer before paint so a previous scroll offset cannot leak
    // into the next onboarding frame.
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [motionActive])

  const stagePanel = !stageCollapsed ? (
    <SetupFlowMotionSwap
      kind="stage"
      reduceMotion={reduceMotion}
      transitionKey={step}
    >
      <SetupFlowStage
        height={stageHeight ?? metrics.stageHeight}
        interactive={stageInteractive}
      >
        {stage}
      </SetupFlowStage>
    </SetupFlowMotionSwap>
  ) : null

  const headingPanel = !hideHeading && !headingCollapsed ? (
    <SetupFlowMotionSwap
      kind="panel"
      reduceMotion={reduceMotion}
      transitionKey={`${step}-heading`}
    >
      <View
        style={[
          styles.headingBlock,
          headingOffsetY !== 0 ? { transform: [{ translateY: headingOffsetY }] } : null
        ]}
      >
        <Text accessibilityRole="header" style={styles.title}>
          {effectiveTitle}
        </Text>
        <Text style={styles.description}>{effectiveDescription}</Text>
      </View>
    </SetupFlowMotionSwap>
  ) : null

  const taskPanel = !hideTaskCard ? (
    <SetupFlowMotionSwap
      kind="panel"
      reduceMotion={reduceMotion}
      testID="setup-flow-panel"
      transitionKey={step}
    >
      <View
        style={[
          styles.panel,
          taskCardOffsetY !== 0
            ? { transform: [{ translateY: taskCardOffsetY }] }
            : null
        ]}
      >
        <SetupFlowTaskCard
          minHeight={taskCardMinHeight}
          padding={metrics.taskCardPadding}
          tone={taskCardTone}
        >
          {children}
        </SetupFlowTaskCard>
        <View
          accessibilityLiveRegion="polite"
          style={styles.feedback}
          testID="setup-flow-feedback"
        >
          {feedback}
        </View>
      </View>
    </SetupFlowMotionSwap>
  ) : (
    <View
      accessibilityLiveRegion="polite"
      style={styles.feedback}
      testID="setup-flow-feedback"
    >
      {feedback}
    </View>
  )

  const primaryAction = (
    <SetupFlowPrimaryAction
      busy={primaryActionBusy}
      disabled={primaryActionDisabled}
      label={effectiveActionLabel}
      onPress={onPrimaryAction}
      reduceMotion={reduceMotion}
      testID={primaryActionTestID}
    />
  )

  return (
    <View style={styles.root} testID={testID}>
      {!immersiveBottomSheet ? (
        <SoftBlobBackground
          animated={motionActive && !reduceMotion}
          variant="bootstrap"
        />
      ) : null}
      {immersiveBottomSheet ? <View pointerEvents="none" style={styles.immersiveBottomBleed} /> : null}
      <SafeAreaView contentGutter={false} edges={["top", "bottom"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
          style={styles.flex}
        >
          <View
            style={[
              styles.shell,
              { paddingHorizontal: metrics.horizontalInset }
            ]}
          >
            <SetupFlowHeader
              backDisabled={backDisabled || primaryActionBusy}
              current={progress.current}
              onBack={onBack}
              progressStyle={headerProgressStyle}
              title={headerTitle}
            />
            {!hideProgressRail ? (
              <SetupFlowProgress
                current={progress.current}
                reduceMotion={reduceMotion}
              />
            ) : null}
            {immersiveBottomSheet ? (
              <View style={styles.immersiveFlow}>
                {stagePanel}
                <View
                  style={[
                    styles.bottomSheetSurface,
                    { marginHorizontal: -metrics.horizontalInset }
                  ]}
                  testID="setup-flow-bottom-sheet"
                >
                  <ScrollView
                    bounces={false}
                    contentContainerStyle={[
                      styles.immersiveSheetContent,
                      {
                        paddingHorizontal: metrics.horizontalInset,
                      paddingBottom:
                        scrollContentBottomPadding
                      }
                    ]}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    scrollEnabled={immersiveBottomSheet || metrics.shouldScroll || keyboardVisible}
                    showsVerticalScrollIndicator={false}
                    ref={scrollRef}
                    style={styles.immersiveSheetScroll}
                  >
                    {headingPanel}
                    {taskPanel}
                  </ScrollView>
                  <View
                    style={[
                      styles.footer,
                      styles.immersiveFooter,
                      { paddingHorizontal: metrics.horizontalInset }
                    ]}
                  >
                    {primaryAction}
                  </View>
                </View>
              </View>
            ) : (
              <>
                <ScrollView
                  bounces={false}
                  contentContainerStyle={[
                    styles.scrollContent,
                    {
                      paddingTop: scrollContentTopPadding,
                      paddingBottom:
                        scrollContentBottomPadding
                    }
                  ]}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={metrics.shouldScroll || keyboardVisible}
                  showsVerticalScrollIndicator={false}
                  ref={scrollRef}
                  style={styles.scroll}
                >
                  {stagePanel}
                  {headingPanel}
                  {taskPanel}
                </ScrollView>
                <View style={styles.footer}>{primaryAction}</View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: uiTheme.colors.backgroundWarm,
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  bottomSheetSurface: {
    backgroundColor: uiTheme.colors.surfaceRaised,
    borderColor: "rgba(255,255,255,0.96)",
    borderTopLeftRadius: 42,
    borderTopRightRadius: 42,
    borderWidth: 1,
    borderBottomWidth: 0,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    zIndex: 1
  },
  immersiveBottomBleed: {
    backgroundColor: uiTheme.colors.surfaceRaised,
    bottom: 0,
    height: 96,
    left: 0,
    position: "absolute",
    right: 0
  },
  flex: {
    flex: 1
  },
  shell: {
    alignSelf: "center",
    flex: 1,
    maxWidth: 560,
    width: "100%"
  },
  scroll: {
    flex: 1
  },
  immersiveFlow: {
    flex: 1,
    minHeight: 0
  },
  immersiveSheetScroll: {
    flex: 1
  },
  immersiveSheetContent: {
    flexGrow: 1,
    gap: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.xs,
    paddingTop: uiTheme.spacing.md
  },
  scrollContent: {
    flexGrow: 1,
    gap: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.sm
  },
  panel: {
    gap: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.sm
  },
  headingBlock: {
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.sm
  },
  title: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  description: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  feedback: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24
  },
  footer: {
    // Give the CTA the same generous lower rhythm across every setup step.
    backgroundColor: uiTheme.colors.backgroundWarm,
    paddingBottom: ONBOARDING_PRIMARY_ACTION_LAYOUT.bottomInset,
    paddingTop: uiTheme.spacing.xs
  },
  immersiveFooter: {
    backgroundColor: uiTheme.colors.surfaceRaised,
    paddingTop: uiTheme.spacing.sm
  }
})
