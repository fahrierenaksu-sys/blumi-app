import type { ReactionEvent } from "@blumi/contracts"

export interface ReactionRecord extends ReactionEvent {
  reactionId: string
}

export interface ReactionRepository {
  saveReaction(reaction: ReactionRecord): Promise<void>
}

export interface InMemoryReactionStore {
  reactions: ReactionRecord[]
}

export function createInMemoryReactionStore(): InMemoryReactionStore {
  return {
    reactions: []
  }
}

export function createInMemoryReactionRepository(
  store: InMemoryReactionStore = createInMemoryReactionStore()
): ReactionRepository {
  return {
    async saveReaction(reaction) {
      store.reactions = [
        ...store.reactions.map((entry) => ({ ...entry })),
        { ...reaction }
      ]
    }
  }
}
