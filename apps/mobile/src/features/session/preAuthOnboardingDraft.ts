export type PreAuthOnboardingRoute = "profile" | "avatar" | "room" | "register"

export const PRE_AUTH_ONBOARDING_ROUTE_ORDER: readonly PreAuthOnboardingRoute[] =
  Object.freeze(["profile", "avatar", "room", "register"])

export interface PreAuthOnboardingDraft<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
> {
  readonly profile: ProfileDraft | null
  readonly avatar: AvatarDraft | null
  readonly room: RoomDraft | null
}

export interface PreAuthOnboardingReplaySteps<
  Registration,
  ProfileDraft,
  AvatarDraft,
  RoomDraft
> {
  register(): Promise<Registration>
  saveProfile(registration: Registration, profile: ProfileDraft): Promise<void>
  saveAvatar(registration: Registration, avatar: AvatarDraft): Promise<void>
  saveRoom(registration: Registration, room: RoomDraft): Promise<void>
  completeOnboarding(registration: Registration): Promise<void>
  clearDraft(): Promise<void>
}

export function createPreAuthOnboardingDraft<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
>(): PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft> {
  return {
    profile: null,
    avatar: null,
    room: null
  }
}

export function setPreAuthProfileDraft<
  CurrentProfile,
  AvatarDraft,
  RoomDraft,
  NextProfile
>(
  draft: PreAuthOnboardingDraft<CurrentProfile, AvatarDraft, RoomDraft>,
  profile: NextProfile
): PreAuthOnboardingDraft<NextProfile, AvatarDraft, RoomDraft> {
  return {
    ...draft,
    profile
  }
}

export function setPreAuthAvatarDraft<
  ProfileDraft,
  CurrentAvatar,
  RoomDraft,
  NextAvatar
>(
  draft: PreAuthOnboardingDraft<ProfileDraft, CurrentAvatar, RoomDraft>,
  avatar: NextAvatar
): PreAuthOnboardingDraft<ProfileDraft, NextAvatar, RoomDraft> {
  return {
    ...draft,
    avatar
  }
}

export function setPreAuthRoomDraft<
  ProfileDraft,
  AvatarDraft,
  CurrentRoom,
  NextRoom
>(
  draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, CurrentRoom>,
  room: NextRoom
): PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, NextRoom> {
  return {
    ...draft,
    room
  }
}

export function getNextPreAuthOnboardingRoute(
  draft: PreAuthOnboardingDraft
): PreAuthOnboardingRoute {
  if (draft.profile === null) return "profile"
  if (draft.avatar === null) return "avatar"
  if (draft.room === null) return "room"
  return "register"
}

export function isPreAuthOnboardingDraftReady<ProfileDraft, AvatarDraft, RoomDraft>(
  draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>
): draft is PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft> & {
  readonly profile: ProfileDraft
  readonly avatar: AvatarDraft
  readonly room: RoomDraft
} {
  return draft.profile !== null && draft.avatar !== null && draft.room !== null
}

export async function replayPreAuthOnboardingDraft<
  Registration,
  ProfileDraft,
  AvatarDraft,
  RoomDraft
>(
  draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>,
  steps: PreAuthOnboardingReplaySteps<
    Registration,
    ProfileDraft,
    AvatarDraft,
    RoomDraft
  >
): Promise<Registration> {
  if (!isPreAuthOnboardingDraftReady(draft)) {
    throw new Error("Pre-auth onboarding draft is not ready for registration")
  }

  const registration = await steps.register()
  await steps.saveProfile(registration, draft.profile)
  await steps.saveAvatar(registration, draft.avatar)
  await steps.saveRoom(registration, draft.room)
  await steps.completeOnboarding(registration)
  await steps.clearDraft()
  return registration
}
