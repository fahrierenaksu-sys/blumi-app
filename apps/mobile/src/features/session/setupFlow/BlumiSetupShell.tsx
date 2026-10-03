import {
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import { SoftBlobBackground } from "../../../ui/backgrounds"
import { useReducedMotion } from "../../../ui/animations"
import { AppKeyboardAvoidingView, useKeyboardOpenAmount } from "../../../ui/keyboard"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { SetupFlowHeader } from "./SetupFlowHeader"
import { SetupFlowMotionSwap } from "./SetupFlowMotionSwap"
import { SetupFlowPrimaryAction } from "./SetupFlowPrimaryAction"
import { ONBOARDING_PRIMARY_ACTION_LAYOUT } from "../onboardingActionLayout"
import { SetupFlowProgress } from "./SetupFlowProgress"
import { SetupFlowStage } from "./SetupFlowStage"
import { SetupFlowTaskCard } from "./SetupFlowTaskCard"
import {
  getSetupCollapsibleSlotStyle,
  getSetupKeyboardAmount,
  getSetupLayoutMetrics,
  getSetupProgress,
  mixSetupKeyboardValue,
  type PreAuthSetupStep
} from "./setupFlowShellModel"
import { getCurrentSetupFlowCopy } from "./setupFlowLocale"
import { useSetupKeyboardScrollReturn } from "./useSetupKeyboardScrollReturn"

// When the keyboard opens or closes, the collapsible stage and heading close
// with it and the rest of the column follows, all driven by the keyboard's
// open amount on the UI thread: no React render per frame and no layout
// animation. React hears only when the keyboard layout turns on or off. When
// the keyboard closes, the column's scroll glides back to its top with it, so
// the resting layout always returns whole.

/**
 * A panel that collapses for the keyboard. Its content keeps its natural
 * height (measured once) while the slot around it closes and clips it.
 */
function KeyboardCollapsibleSlot({
  collapse,
  gapAfter,
  hidden,
  children
}: {
  collapse: SharedValue<number>
  gapAfter: number
  /** True while the keyboard layout is on: the panel is (being) collapsed. */
  hidden: boolean
  children: ReactNode
}) {
  const naturalHeight = useSharedValue(0)
  const slotStyle = useAnimatedStyle(() =>
    getSetupCollapsibleSlotStyle(collapse.value, naturalHeight.value, gapAfter)
  )
  return (
    <Animated.View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[styles.keyboardSlot, styles.collapsibleSlot, slotStyle]}
    >
      <View
        onLayout={(event) => {
          // The clipped slot can constrain this measurement while typing.
          // Keep the resting height; measuring the collapsed panel feeds its
          // shrinking height back into the next frame and can trap it at zero.
          const height = event.nativeEvent.layout.height
          if (collapse.value === 0 && height > 0) naturalHeight.value = height
        }}
      >
        {children}
      </View>
    </Animated.View>
  )
}

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
  /**
   * Shown right above the primary action, in the dock that rides the keyboard,
   * so it is always fully readable together with the action it qualifies
   * (the phone step's terms consent).
   */
  footerAccessory?: ReactNode
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
  footerAccessory,
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
  const metrics = useMemo(
    () => getSetupLayoutMetrics({ width, height, fontScale }),
    [fontScale, height, width]
  )
  const progress = getSetupProgress(step)
  const copy = getCurrentSetupFlowCopy().steps[step]

  // Only the visible step follows the keyboard; hidden (prepared or left)
  // steps keep the open layout (ONB-08).
  const keyboardOpen = useKeyboardOpenAmount()
  const keyboardAmount = useDerivedValue(() =>
    getSetupKeyboardAmount(keyboardOpen.value, motionActive, reduceMotion)
  )
  const stageCollapse = useDerivedValue(() =>
    collapseStageOnKeyboard ? keyboardAmount.value : 0
  )
  const headingCollapse = useDerivedValue(() =>
    collapseHeadingOnKeyboard ? keyboardAmount.value : 0
  )
  // The one React update per keyboard toggle: the column may scroll, and
  // collapsed panels leave the accessibility tree.
  const [keyboardLayoutActive, setKeyboardLayoutActive] = useState(false)
  const { scrollRef, onScroll } = useSetupKeyboardScrollReturn(keyboardAmount)
  useAnimatedReaction(
    () => keyboardAmount.value > 0,
    (open, previous) => {
      if (open !== previous) scheduleOnRN(setKeyboardLayoutActive, open)
    }
  )
  useAnimatedReaction(
    () => stageCollapse.value >= 1,
    (collapsed, previous) => {
      // Once the stage is gone, the task card starts at the top.
      if (collapsed && previous === false) scrollTo(scrollRef, 0, 0, false)
    }
  )

  const effectiveTitle = title ?? copy.title
  const effectiveDescription = description ?? copy.description
  const effectiveActionLabel = primaryActionLabel ?? copy.primaryAction
  const keyboardBottomPadding =
    metrics.primaryActionHeight + uiTheme.spacing.xl + uiTheme.spacing.md
  const openBottomPadding = scrollBottomInset ?? keyboardBottomPadding
  const openTopPadding = uiTheme.spacing.sm
  const contentPaddingStyle = useAnimatedStyle(() => ({
    paddingTop: mixSetupKeyboardValue(openTopPadding, 0, keyboardAmount.value),
    paddingBottom: mixSetupKeyboardValue(openBottomPadding, keyboardBottomPadding, keyboardAmount.value)
  }))
  const sheetPaddingStyle = useAnimatedStyle(() => ({
    paddingBottom: mixSetupKeyboardValue(openBottomPadding, keyboardBottomPadding, keyboardAmount.value)
  }))

  useLayoutEffect(() => {
    if (!motionActive) return
    // Setup layers stay mounted to make forward transitions cheap. Reset the
    // reactivated layer before paint so a previous scroll offset cannot leak
    // into the next onboarding frame.
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [motionActive, scrollRef])

  const stageContent = (
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
  )
  const stagePanel = collapseStageOnKeyboard ? (
    <KeyboardCollapsibleSlot
      collapse={stageCollapse}
      gapAfter={immersiveBottomSheet ? 0 : uiTheme.spacing.md}
      hidden={keyboardLayoutActive}
    >
      {stageContent}
    </KeyboardCollapsibleSlot>
  ) : (
    <View style={styles.keyboardSlot}>{stageContent}</View>
  )

  const headingContent = (
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
  )
  const headingPanel = hideHeading ? null : collapseHeadingOnKeyboard ? (
    <KeyboardCollapsibleSlot
      collapse={headingCollapse}
      gapAfter={uiTheme.spacing.md}
      hidden={keyboardLayoutActive}
    >
      {headingContent}
    </KeyboardCollapsibleSlot>
  ) : (
    <View style={styles.keyboardSlot}>{headingContent}</View>
  )

  const taskPanelContent = !hideTaskCard ? (
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
  const taskPanel = <View style={styles.keyboardSlot}>{taskPanelContent}</View>

  const primaryAction = (
    <>
      {footerAccessory ? (
        <View style={styles.footerAccessory}>{footerAccessory}</View>
      ) : null}
      <SetupFlowPrimaryAction
        busy={primaryActionBusy}
        disabled={primaryActionDisabled}
        label={effectiveActionLabel}
        onPress={onPrimaryAction}
        reduceMotion={reduceMotion}
        testID={primaryActionTestID}
      />
    </>
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
        <AppKeyboardAvoidingView style={styles.flex}>
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
                  <Animated.ScrollView
                    bounces={false}
                    contentContainerStyle={styles.scrollContainer}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    ref={scrollRef}
                    style={styles.immersiveSheetScroll}
                  >
                    <Animated.View
                      style={[
                        styles.immersiveSheetContent,
                        { paddingHorizontal: metrics.horizontalInset },
                        sheetPaddingStyle
                      ]}
                    >
                      {headingPanel}
                      {taskPanel}
                    </Animated.View>
                  </Animated.ScrollView>
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
                <Animated.ScrollView
                  bounces={false}
                  contentContainerStyle={styles.scrollContainer}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  onScroll={onScroll}
                  scrollEnabled={metrics.shouldScroll || keyboardLayoutActive}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                  ref={scrollRef}
                  style={styles.scroll}
                >
                  <Animated.View style={[styles.scrollContent, contentPaddingStyle]}>
                    {stagePanel}
                    {headingPanel}
                    {taskPanel}
                  </Animated.View>
                </Animated.ScrollView>
                <View style={styles.footer}>{primaryAction}</View>
              </>
            )}
          </View>
        </AppKeyboardAvoidingView>
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
  keyboardSlot: {
    width: "100%"
  },
  collapsibleSlot: {
    overflow: "hidden"
  },
  scrollContainer: {
    flexGrow: 1
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
  footerAccessory: {
    paddingBottom: uiTheme.spacing.xs
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
