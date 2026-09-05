import type {
  ConnectionDecisionRecord,
  ConnectionMatch
} from "@blumi/contracts"

export interface ConnectionRepository {
  saveDecision(decision: ConnectionDecisionRecord): Promise<void>
  findDecision(
    miniRoomId: string,
    actorUserId: string
  ): Promise<ConnectionDecisionRecord | null>
  findMatch(miniRoomId: string): Promise<ConnectionMatch | null>
  findMatchBetween(
    userAId: string,
    userBId: string
  ): Promise<ConnectionMatch | null>
  saveMatch(match: ConnectionMatch): Promise<void>
}

export interface InMemoryConnectionStore {
  decisions: Map<string, ConnectionDecisionRecord>
  matches: Map<string, ConnectionMatch>
}

export function createInMemoryConnectionStore(): InMemoryConnectionStore {
  return {
    decisions: new Map(),
    matches: new Map()
  }
}

export function createInMemoryConnectionRepository(
  store: InMemoryConnectionStore = createInMemoryConnectionStore()
): ConnectionRepository {
  return {
    async saveDecision(decision) {
      store.decisions.set(decisionKey(decision.miniRoomId, decision.actorUserId), {
        ...decision
      })
    },
    async findDecision(miniRoomId, actorUserId) {
      const decision = store.decisions.get(decisionKey(miniRoomId, actorUserId))
      return decision ? { ...decision } : null
    },
    async findMatch(miniRoomId) {
      const match = store.matches.get(miniRoomId)
      return match
        ? {
            ...match,
            participantUserIds: [...match.participantUserIds] as [string, string]
          }
        : null
    },
    async findMatchBetween(userAId, userBId) {
      const match = [...store.matches.values()].find((candidate) =>
        candidate.participantUserIds.includes(userAId) &&
        candidate.participantUserIds.includes(userBId)
      )
      return match
        ? {
            ...match,
            participantUserIds: [...match.participantUserIds] as [string, string]
          }
        : null
    },
    async saveMatch(match) {
      store.matches.set(match.miniRoomId, {
        ...match,
        participantUserIds: [...match.participantUserIds] as [string, string]
      })
    }
  }
}

function decisionKey(miniRoomId: string, actorUserId: string): string {
  return `${miniRoomId}:${actorUserId}`
}
