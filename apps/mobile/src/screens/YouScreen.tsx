import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { SessionActor } from "../features/session/sessionApi"
import { getAppLocale } from "../features/session/authLocale"
import { getYouScreenCopy } from "../features/session/youScreenCopy"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { MyAvatar } from "../ui/myAvatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { TopBar, ActionButtonCircle } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { VIBE_PRESETS } from "../ui/vibeTilePicker"

type YouScreenProps = NativeStackScreenProps<RootStackParamList, "You"> & {
  sessionActor: SessionActor
  onResetSession: () => void
}

export function YouScreen(props: YouScreenProps) {
  const { navigation, sessionActor, onResetSession } = props
  const { profile } = sessionActor
  const copy = getYouScreenCopy(getAppLocale())

  const vibePreset = VIBE_PRESETS.find((p) => p.id === profile.avatar.presetId)
  const vibeLabel = vibePreset?.label ?? copy.customVibe
  const vibeColor = vibePreset?.swatch ?? uiTheme.colors.primary
  const confirmSignOut = () => {
    Alert.alert(copy.signOutTitle, copy.signOutBody, [
      { text: copy.cancel, style: "cancel" },
      { text: copy.signOut, style: "destructive", onPress: onResetSession }
    ])
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <TopBar
          title={copy.title}
          titleAlign="start"
          leftSlot={
            <ActionButtonCircle accessibilityLabel={copy.back} onPress={() => navigation.goBack()} size={40}>
              <Ionicons name="chevron-back" size={22} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
          }
          rightSlot={<View style={styles.topRightSpacer} />}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero avatar card */}
          <View style={styles.heroCardOuter}>
            <LinearGradient
              colors={["#E8DCF9", "#FBE3EF", "#FFEAEC"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroGlassWash} pointerEvents="none" />
              <View style={styles.heroGlow} pointerEvents="none" />
              <MyAvatar
                name={profile.displayName}
                seed={profile.userId}
                size={160}
                ring="strong"
              />
            </LinearGradient>
          </View>

          {/* Identity */}
          <View style={styles.identityBlock}>
            <Text style={styles.nameText}>{profile.displayName}</Text>
            {profile.age ? (
              <Text style={styles.ageText}>{copy.age(profile.age)}</Text>
            ) : null}
            <View style={styles.vibeRow}>
              <View style={[styles.vibeDot, { backgroundColor: vibeColor }]} />
              <Text style={styles.vibeLabel}>{copy.vibe(vibeLabel)}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.editProfile}
              onPress={() => navigation.navigate("ProfileEdit")}
              style={({ pressed }) => [
                styles.glassActionCard,
                styles.editActionCard,
                pressed ? styles.glassActionCardPressed : null
              ]}
            >
              <View style={styles.glassActionIconWrap}>
                <Ionicons name="pencil-outline" size={22} color={uiTheme.colors.primaryDeep} />
              </View>
              <Text style={styles.glassActionTitle}>{copy.editProfile}</Text>
              <Text style={styles.glassActionDesc}>{copy.editProfileDescription}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.settings}
              onPress={() => navigation.navigate("Settings")}
              style={({ pressed }) => [
                styles.glassActionCard,
                pressed ? styles.glassActionCardPressed : null
              ]}
            >
              <View style={styles.glassActionIconWrap}>
                <Ionicons name="settings-outline" size={22} color={uiTheme.colors.primaryDeep} />
              </View>
              <Text style={styles.glassActionTitle}>{copy.settings}</Text>
              <Text style={styles.glassActionDesc}>{copy.settingsDescription}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel={copy.signOutAccessibility}
            accessibilityRole="button"
            onPress={confirmSignOut}
            style={({ pressed }) => [
              styles.signOutGlassButton,
              pressed ? styles.signOutGlassButtonPressed : null
            ]}
            testID="session-sign-out"
          >
            <Text style={styles.signOutGlassText}>{copy.signOut}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm
  },
  topRightSpacer: {
    width: 40
  },
  scroll: {
    gap: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.xxl
  },

  /* ── Hero ───────────────────────────────────── */
  heroCardOuter: {
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.82)",
    ...uiTheme.shadow.float,
  },
  heroCard: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroGlassWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  heroGlow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255, 137, 184, 0.22)",
    top: -60,
    left: -40,
  },
  nameplatePreview: {
    position: "absolute",
    bottom: uiTheme.spacing.md,
    alignSelf: "center",
    maxWidth: "84%",
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1
  },
  nameplatePreviewText: {
    flexShrink: 1,
    ...uiTheme.font.caption,
    fontWeight: "900"
  },
  nameplatePreviewMeta: {
    color: "rgba(32, 22, 42, 0.66)",
    ...uiTheme.font.micro,
    fontWeight: "900",
    textTransform: "uppercase"
  },

  /* ── Identity ──────────────────────────────── */
  identityBlock: {
    gap: uiTheme.spacing.xxs,
    paddingHorizontal: 2
  },
  nameText: {
    color: uiTheme.colors.textPrimary,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.6
  },
  ageText: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.body,
    fontWeight: "600"
  },
  vibeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4
  },
  vibeDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  vibeLabel: {
    color: uiTheme.colors.primaryDeep,
    ...uiTheme.font.label,
    fontWeight: "800"
  },

  actionGrid: {
    flexDirection: "column",
    gap: uiTheme.spacing.md,
  },
  glassActionCard: {
    flex: 1,
    padding: uiTheme.spacing.md,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
    alignItems: "flex-start",
    gap: 6,
    ...uiTheme.shadow.soft,
  },
  editActionCard: {
    backgroundColor: "rgba(255, 241, 248, 0.86)",
    borderColor: "rgba(255, 79, 152, 0.28)"
  },
  glassActionCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  glassActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  glassActionTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
  },
  glassActionDesc: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
  },
  signOutGlassButton: {
    alignSelf: "center",
    marginTop: uiTheme.spacing.lg,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: "rgba(255, 230, 235, 0.7)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 180, 200, 0.8)",
    ...uiTheme.shadow.soft,
  },
  signOutGlassButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  signOutGlassText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.dangerInk,
    fontWeight: "800",
  }
})
