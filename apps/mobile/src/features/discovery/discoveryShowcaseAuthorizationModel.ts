// Who may see a Discover card's room showcase on its back face. The showcase
// is fetched per viewer, session and flip; a result is shown only while it
// still belongs to the current viewer and the open back face, and a
// server-backed card never falls back to room fields embedded in the profile.
// The request for a flip starts on the touch that becomes it (press-in), so
// the room is usually ready when the back face turns into view; a touch that
// becomes a swipe drops it.

export interface ShowcaseRequest {
  baseHttpUrl: string
  viewerUserId: string
  sessionToken: string
}

export interface ShowcaseAuthorization extends ShowcaseRequest {
  id: number
  candidateUserId: string
  /** False while only a press has started it; true once a flip opened the back face with it. */
  opened: boolean
}

export interface ShowcaseRoom {
  roomSnapshotUrl?: string | null
  roomHeadline?: string | null
}

/** The authorization belongs to this viewer, session and card (open or about to open). */
export function isShowcaseAuthorizationCurrent(input: {
  request: ShowcaseRequest | undefined
  authorization: ShowcaseAuthorization | null
  candidateUserId: string
}): boolean {
  const { request, authorization, candidateUserId } = input
  return Boolean(
    request && authorization &&
    authorization.baseHttpUrl === request.baseHttpUrl &&
    authorization.viewerUserId === request.viewerUserId &&
    authorization.sessionToken === request.sessionToken &&
    authorization.candidateUserId === candidateUserId
  )
}

/** The open back face's authorization belongs to this viewer, session and card. */
export function doesShowcaseAuthorizationMatch(input: {
  isBackVisible: boolean
  request: ShowcaseRequest | undefined
  authorization: ShowcaseAuthorization | null
  candidateUserId: string
}): boolean {
  return input.isBackVisible && input.authorization?.opened === true && isShowcaseAuthorizationCurrent(input)
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

function createShowcaseAuthorization(
  request: ShowcaseRequest,
  candidateUserId: string,
  id: number,
  opened: boolean
): ShowcaseAuthorization {
  return {
    id,
    baseHttpUrl: request.baseHttpUrl,
    viewerUserId: request.viewerUserId,
    candidateUserId,
    sessionToken: request.sessionToken,
    opened
  }
}

/**
 * A press on the front face starts a fresh authorization for the flip it may
 * become. Nothing starts while the back face is open (that press closes it).
 */
export function beginShowcaseAuthorizationOnPress(input: {
  isBackVisible: boolean
  request: ShowcaseRequest | undefined
  candidateUserId: string
  nextId: number
}): ShowcaseAuthorization | null {
  if (input.isBackVisible || !input.request) return null
  return createShowcaseAuthorization(input.request, input.candidateUserId, input.nextId, false)
}

/**
 * The authorization after a flip: opening the back face uses the one its own
 * press started (still this viewer, session and card) or starts a fresh one;
 * closing it drops any authorization. An opened authorization is never
 * reused, so every opening gets its own request.
 */
export function nextShowcaseAuthorizationOnFlip(input: {
  nextVisible: boolean
  request: ShowcaseRequest | undefined
  candidateUserId: string
  nextId: number
  pressed?: ShowcaseAuthorization | null
}): ShowcaseAuthorization | null {
  if (!input.nextVisible || !input.request) return null
  const pressed = input.pressed ?? null
  if (pressed && !pressed.opened && isShowcaseAuthorizationCurrent({ ...input, authorization: pressed })) {
    return { ...pressed, opened: true }
  }
  return createShowcaseAuthorization(input.request, input.candidateUserId, input.nextId, true)
}

/** A press that ended without opening the back face (it became a swipe) drops its request. */
export function dropUnopenedShowcaseAuthorization(
  authorization: ShowcaseAuthorization | null
): ShowcaseAuthorization | null {
  return authorization?.opened ? authorization : null
}

export type RoomShowcaseSlot = "footer" | "placeholder" | "room"

/**
 * What the back face's bottom slot shows. A card that can have a showcase
 * keeps its room panel in place (a quiet placeholder) until the answer is in,
 * then shows the room or, without one, the return hint, so nothing appears or
 * moves late.
 */
export function resolveRoomShowcaseSlot(input: {
  expectsShowcase: boolean
  settled: boolean
  hasRoom: boolean
}): RoomShowcaseSlot {
  if (input.hasRoom) return "room"
  if (!input.expectsShowcase || input.settled) return "footer"
  return "placeholder"
}
