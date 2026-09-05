import type { QueryResultRow } from "pg"
import type {
  ReactionRecord,
  ReactionRepository
} from "../reactions/reactionRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresReactionRepository(
  pool: QueryExecutor
): ReactionRepository {
  return {
    async saveReaction(reaction: ReactionRecord) {
      await pool.query(
        `INSERT INTO blumi_reactions (
            reaction_id, room_id, actor_user_id, target_user_id,
            reaction, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (reaction_id) DO NOTHING`,
        [
          reaction.reactionId,
          reaction.roomId,
          reaction.actorUserId,
          reaction.targetUserId ?? null,
          reaction.reaction,
          reaction.createdAt
        ]
      )
    }
  }
}
