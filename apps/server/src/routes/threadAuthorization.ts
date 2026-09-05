import type { ConnectionRepository } from "../connections/connectionRepository"
import type { MatchRepository } from "../matches/matchRepository"

export interface ThreadAuthorization {
  source: "match" | "connection"
  sourceId: string
  miniRoomId: string
}

export async function findThreadAuthorization(input: {
  participantUserIds: readonly [string, string]
  matchRepository: MatchRepository
  connectionRepository?: ConnectionRepository
}): Promise<ThreadAuthorization | null> {
  const [userAId, userBId] = input.participantUserIds
  const match = await input.matchRepository.findMatchBetween(userAId, userBId)
  if (match) {
    return {
      source: "match",
      sourceId: match.matchId,
      miniRoomId: `match_${match.matchId}`
    }
  }

  const connection = await input.connectionRepository?.findMatchBetween(
    userAId,
    userBId
  )
  if (!connection) return null
  return {
    source: "connection",
    sourceId: connection.miniRoomId,
    miniRoomId: connection.miniRoomId
  }
}

export function createAuthorizedThreadId(
  authorization: ThreadAuthorization
): string {
  return `thread_${authorization.source}_${authorization.sourceId}`
}
