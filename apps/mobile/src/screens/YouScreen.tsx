import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { StyleSheet, View } from "react-native"
import Reanimated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { SessionActor } from "../features/session/sessionApi"
import { getAppLocale } from "../features/session/authLocale"
import { getOwnProfileCopy } from "../features/profile/profileCopy"
import { resolveOwnProfileSections } from "../features/profile/profileViewModel"
import { OwnProfileHero } from "../features/profile/OwnProfileHero"
import { OwnProfileIdentity } from "../features/profile/OwnProfileIdentity"
import { ProfileCompletenessCard } from "../features/profile/ProfileCompletenessCard"
import {
  ProfileAddCard,
  ProfileBioCard,
  ProfileInterestChips,
  ProfilePreviewEntry,
  ProfilePromptCards,
  ProfileSection
} from "../features/profile/OwnProfileSections"
import { ProfileReveal } from "../features/profile/ProfileReveal"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { uiTheme } from "../ui/theme"
import { VIBE_PRESETS } from "../ui/vibeTilePicker"

type YouScreenProps = NativeStackScreenProps<RootStackParamList, "You"> & {
  sessionActor: SessionActor
  /** Unused since sign-out lives only in Settings (DSC-16); kept for the navigator's props. */
  onResetSession: () => void
}

/**
 * The own profile, opened from My Room's profile button: a live chibi stage,
 * the name card with the one "Edit profile" pill, a readiness card, then what
 * the user wrote (bio, interests, prompts), each replaced by a gentle "add"
 * card while empty, and "See how others see you". Settings is the gear.
 */
export function YouScreen(props: YouScreenProps) {
  const { navigation, sessionActor } = props
  const { profile } = sessionActor
  const locale = getAppLocale()
  const copy = getOwnProfileCopy(locale)
  const sections = resolveOwnProfileSections(profile, locale)
  const vibePreset = VIBE_PRESETS.find((preset) => preset.id === profile.avatar.presetId)
  const scrollY = useSharedValue(0)
  const handleScroll = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y })

  const openEdit = (): void => navigation.navigate("ProfileEdit")
  const openSettings = (): void => navigation.navigate("Settings")
  const openPreview = (): void =>
    navigation.navigate("ProfilePreview", { userId: profile.userId, context: "self" })

  let revealIndex = 0
  const nextReveal = (): number => revealIndex++

  return (
    <View style={styles.root}>
      <Reanimated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <OwnProfileHero
          displayName={profile.displayName}
          copy={copy}
          scrollY={scrollY}
          onBack={() => goBackOrFallback(navigation, () => navigation.replace("MyRoom"))}
          onOpenSettings={openSettings}
        />
        <SafeAreaView contentGutter style={styles.body} edges={["left", "right", "bottom"]}>
          <ProfileReveal index={nextReveal()} style={styles.identitySlot}>
            <OwnProfileIdentity
              copy={copy}
              displayName={profile.displayName}
              age={profile.age}
              vibeLabel={vibePreset?.label ?? copy.customVibe}
              vibeColor={vibePreset?.swatch ?? uiTheme.colors.primary}
              onEditProfile={openEdit}
            />
          </ProfileReveal>

          <ProfileReveal index={nextReveal()}>
            <ProfileCompletenessCard copy={copy} completeness={sections.completeness} onPress={openEdit} />
          </ProfileReveal>

          <ProfileReveal index={nextReveal()}>
            <ProfileSection title={copy.aboutTitle}>
              {sections.bio
                ? <ProfileBioCard bio={sections.bio} />
                : <ProfileAddCard icon="create-outline" title={copy.addBio} hint={copy.addBioHint} onPress={openEdit} />}
            </ProfileSection>
          </ProfileReveal>

          <ProfileReveal index={nextReveal()}>
            <ProfileSection title={copy.interestsTitle}>
              {sections.showAddInterests
                ? <ProfileAddCard icon="pricetags-outline" title={copy.addInterests} hint={copy.addInterestsHint} onPress={openEdit} />
                : <ProfileInterestChips interests={sections.interests} />}
            </ProfileSection>
          </ProfileReveal>

          <ProfileReveal index={nextReveal()}>
            <ProfileSection title={copy.promptsTitle}>
              {sections.prompts.length > 0 ? <ProfilePromptCards prompts={sections.prompts} /> : null}
              {sections.showAddPrompt
                ? <ProfileAddCard icon="chatbubbles-outline" title={copy.addPrompt} hint={copy.addPromptHint} onPress={openEdit} />
                : null}
            </ProfileSection>
          </ProfileReveal>

          <ProfileReveal index={nextReveal()}>
            <ProfilePreviewEntry copy={copy} onPress={openPreview} />
          </ProfileReveal>
        </SafeAreaView>
      </Reanimated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  scroll: {
    paddingBottom: uiTheme.spacing.xxl
  },
  body: {
    gap: uiTheme.spacing.xl
  },
  identitySlot: {
    marginTop: -64
  }
})
