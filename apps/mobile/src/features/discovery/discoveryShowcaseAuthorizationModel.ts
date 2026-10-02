// Who may see a Discover card's room showcase on its back face. The showcase
// is fetched per viewer, session and flip; a result is shown only while it
// still belongs to the current viewer and the open back face, and a
// server-backed card never falls back to room fields embedded in the profile.

export interface ShowcaseRequest {
  baseHttpUrl: string
  viewerUserId: string
  sessionToken: string
}

export interface ShowcaseAuthorization extends ShowcaseRequest {
  id: number
  candidateUserId: string
}

export interface ShowcaseRoom {
  roomSnapshotUrl?: string | null
  roomHeadline?: string | null
}

/** The open back face's authorization belongs to this viewer, session and card. */
export function doesShowcaseAuthorizationMatch(input: {
  isBackVisible: boolean
  request: ShowcaseRequest | undefined
  authorization: ShowcaseAuthorization | null
  candidateUserId: string
}): boolean {
  const { isBackVisible, request, authorization, candidateUserId } = input
  return Boolean(
    isBackVisible && request && authorization &&
    authorization.baseHttpUrl === request.baseHttpUrl &&
    authorization.viewerUserId === request.viewerUserId &&
    authorization.sessionToken === request.sessionToken &&
    authorization.candidateUserId === candidateUserId
  )
}

/** A showcase result only while it matches and is settled, never a stale one. */
export function selectAuthorizedShowcase<T>(input: {
  matches: boolean
  isSuccess: boolean
  isFetching?: boolean
  data: T | undefined
}): T | undefined {
  return input.matches && input.isSuccess && !input.isFetching ? input.data : undefined
}

/**
 * Only the bundled demo fixture shows its embedded room without a request. A
 * missing production request never makes profile room fields a substitute
 * for current authorization.
 */
export function isBundledDemoShowcase<TSnapshot>(input: {
  request: ShowcaseRequest | undefined
  authorization: ShowcaseAuthorization | null
  userId: string
  roomSnapshot: TSnapshot | undefined
  roomSnapshotUrl: string | undefined
  bundledSnapshot: TSnapshot
}): boolean {
  return Boolean(
    !input.request && !input.authorization &&
    /^demo-user-\d{3}$/.test(input.userId) &&
    input.roomSnapshot === input.bundledSnapshot &&
    !input.roomSnapshotUrl
  )
}

/** The room shown on the back face: the bundled demo room or the authorized showcase. */
export function resolveCardBackRoom<TSnapshot>(input: {
  showEmbeddedDemoRoom: boolean
  profileRoomSnapshot: TSnapshot | undefined
  profileRoomHeadline: string | null | undefined
  authorizedShowcase: ShowcaseRoom | undefined
}): { roomSnapshot: TSnapshot | { uri: string } | undefined; roomHeadline: string | undefined } {
  if (input.showEmbeddedDemoRoom) {
    return { roomSnapshot: input.profileRoomSnapshot, roomHeadline: input.profileRoomHeadline ?? undefined }
  }
  const showcase = input.authorizedShowcase
  return {
    roomSnapshot: showcase?.roomSnapshotUrl ? { uri: showcase.roomSnapshotUrl } : undefined,
    roomHeadline: showcase?.roomHeadline ?? undefined
  }
}

/**
 * The authorization after a flip: opening the back face starts a fresh
 * authorization for this viewer; closing it drops any authorization.
 */
export function nextShowcaseAuthorizationOnFlip(input: {
  nextVisible: boolean
  request: ShowcaseRequest | undefined
  candidateUserId: string
  nextId: number
}): ShowcaseAuthorization | null {
  if (!input.nextVisible || !input.request) return null
  return {
    id: input.nextId,
    baseHttpUrl: input.request.baseHttpUrl,
    viewerUserId: input.request.viewerUserId,
    candidateUserId: input.candidateUserId,
    sessionToken: input.request.sessionToken
  }
}
