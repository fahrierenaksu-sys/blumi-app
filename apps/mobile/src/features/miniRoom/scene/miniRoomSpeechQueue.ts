export const MINI_ROOM_SPEECH_LIFETIME_MS = 4_000

export interface MiniRoomSpeechInput {
  key: string
  speakerUserId: string
  body: string
  lifetimeMs?: number
}

export interface ActiveMiniRoomSpeech extends MiniRoomSpeechInput {
  startedAt: number
  expiresAt: number
}

export interface MiniRoomSpeechQueue {
  active: ActiveMiniRoomSpeech | undefined
  pending: MiniRoomSpeechInput[]
}

export function createMiniRoomSpeechQueue(): MiniRoomSpeechQueue {
  return { active: undefined, pending: [] }
}

export function enqueueMiniRoomSpeech(
  current: MiniRoomSpeechQueue,
  speech: MiniRoomSpeechInput,
  now: number
): MiniRoomSpeechQueue {
  if (current.active) {
    return { active: current.active, pending: [...current.pending, speech] }
  }
  return { active: activate(speech, now), pending: current.pending }
}

export function expireMiniRoomSpeech(
  current: MiniRoomSpeechQueue,
  now: number
): MiniRoomSpeechQueue {
  if (!current.active || current.active.expiresAt > now) return current
  return advance(current, now)
}

export function dismissMiniRoomSpeech(
  current: MiniRoomSpeechQueue,
  activeKey: string,
  now: number
): MiniRoomSpeechQueue {
  if (current.active?.key !== activeKey) return current
  return advance(current, now)
}

function advance(current: MiniRoomSpeechQueue, now: number): MiniRoomSpeechQueue {
  const [next, ...pending] = current.pending
  return {
    active: next ? activate(next, now) : undefined,
    pending
  }
}

function activate(speech: MiniRoomSpeechInput, now: number): ActiveMiniRoomSpeech {
  return {
    ...speech,
    startedAt: now,
    expiresAt: now + (speech.lifetimeMs ?? MINI_ROOM_SPEECH_LIFETIME_MS)
  }
}
