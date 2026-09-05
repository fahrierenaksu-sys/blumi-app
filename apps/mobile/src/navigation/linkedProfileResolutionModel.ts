export type LinkedProfileLoadError = "unavailable" | "failed"

export interface LinkedProfileLoadState<Profile> {
  userId: string | null
  profile: Profile | null
  loadError: LinkedProfileLoadError | null
}

export type LinkedProfileTarget<Profile> =
  | {
      kind: "direct"
      profile: Profile
    }
  | {
      kind: "remote"
      userId: string
    }

export interface LinkedProfileViewState<Profile> {
  profile: Profile | null
  loadError: LinkedProfileLoadError | null
  loading: boolean
}

export function createLinkedProfileLoadState<Profile>(
  userId: string | null
): LinkedProfileLoadState<Profile> {
  return {
    userId,
    profile: null,
    loadError: null
  }
}

export function resolveLinkedProfileRequest<Profile>(
  state: LinkedProfileLoadState<Profile>,
  requestUserId: string,
  profile: Profile
): LinkedProfileLoadState<Profile> {
  if (state.userId !== requestUserId) {
    return { ...state }
  }
  return {
    userId: state.userId,
    profile,
    loadError: null
  }
}

export function failLinkedProfileRequest<Profile>(
  state: LinkedProfileLoadState<Profile>,
  requestUserId: string,
  loadError: LinkedProfileLoadError
): LinkedProfileLoadState<Profile> {
  if (state.userId !== requestUserId) {
    return { ...state }
  }
  return {
    userId: state.userId,
    profile: null,
    loadError
  }
}

export function getLinkedProfileViewState<Profile>(
  target: LinkedProfileTarget<Profile>,
  state: LinkedProfileLoadState<Profile>
): LinkedProfileViewState<Profile> {
  if (target.kind === "direct") {
    return {
      profile: target.profile,
      loadError: null,
      loading: false
    }
  }
  if (state.userId !== target.userId) {
    return {
      profile: null,
      loadError: null,
      loading: true
    }
  }
  return {
    profile: state.profile,
    loadError: state.loadError,
    loading: state.profile === null && state.loadError === null
  }
}
