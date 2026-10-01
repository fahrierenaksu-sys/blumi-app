import type { ChatParticipantSummary, ChatThread, ServerEvent } from "@blumi/contracts"

export type ParticipantUpdate = Extract<ServerEvent, { type: "chat.participant_updated" }>["payload"]
const updates = new Map<string, { participant: ChatParticipantSummary; sequence: number }>()

/** Names follow the profile version; outfits independently follow their saved revision. */
function mergeParticipant(previous: ChatParticipantSummary, incoming: ChatParticipantSummary, incomingWins: boolean): ChatParticipantSummary {
  if (previous.profileUpdatedAt && incoming.profileUpdatedAt && previous.profileUpdatedAt !== incoming.profileUpdatedAt) {
    incomingWins = Date.parse(incoming.profileUpdatedAt) > Date.parse(previous.profileUpdatedAt)
  }
  const preferred = incomingWins ? incoming : previous
  const fallback = incomingWins ? previous : incoming
  const avatar = (previous.avatar?.revision ?? -1) > (incoming.avatar?.revision ?? -1)
    ? previous.avatar : incoming.avatar ?? previous.avatar
  return { ...preferred, displayName: preferred.displayName ?? fallback.displayName, ...(avatar ? { avatar } : {}) }
}

export function recordParticipantUpdate(payload: ParticipantUpdate, sequence: number): boolean {
  const previous = updates.get(payload.participant.userId)
  const incoming = { ...payload.participant, profileUpdatedAt: payload.updatedAt }
  const participant = previous ? mergeParticipant(previous.participant, incoming, true) : incoming
  if (previous && JSON.stringify(previous.participant) === JSON.stringify(participant)) return false
  updates.set(payload.participant.userId, { participant: freezeParticipant(participant), sequence })
  return true
}

/** A response started before a profile event may not restore the registration snapshot. */
export function preserveNewerParticipants(thread: ChatThread, requestSequence: number): ChatThread {
  return { ...thread, participants: thread.participants.map((participant) => {
    const update = updates.get(participant.userId)
    const resolved = update ? mergeParticipant(update.participant, participant, update.sequence <= requestSequence) : participant
    updates.set(participant.userId, { participant: update && JSON.stringify(update.participant) === JSON.stringify(resolved)
      ? update.participant : freezeParticipant(resolved), sequence: Math.max(update?.sequence ?? 0, requestSequence) })
    return resolved
  }) as ChatThread["participants"] }
}

export function resetParticipantUpdates(): void { updates.clear() }

export function getKnownChatParticipant(userId: string): ChatParticipantSummary | undefined {
  const participant = updates.get(userId)?.participant
  return participant ? cloneParticipant(participant) : undefined
}

/** Stable immutable snapshot for React subscriptions; no extra identity store. */
export function getChatParticipantSnapshot(userId: string): ChatParticipantSummary | undefined {
  return updates.get(userId)?.participant
}

export function cloneKnownParticipant(participant: ChatParticipantSummary): ChatParticipantSummary {
  const known = getChatParticipantSnapshot(participant.userId)
  return cloneParticipant(known ? mergeParticipant(participant, known, true) : participant)
}

function freezeParticipant(participant: ChatParticipantSummary): ChatParticipantSummary {
  const clone = cloneParticipant(participant)
  if (clone.avatar) {
    Object.freeze(clone.avatar.loadout.accessoryIds)
    Object.freeze(clone.avatar.loadout)
    Object.freeze(clone.avatar)
  }
  return Object.freeze(clone)
}

export function cloneParticipant(participant: ChatThread["participants"][number]): ChatThread["participants"][number] {
  return { ...participant, ...(participant.avatar ? { avatar: {
    ...participant.avatar,
    loadout: { ...participant.avatar.loadout, accessoryIds: [...participant.avatar.loadout.accessoryIds] }
  } } : {}) }
}
