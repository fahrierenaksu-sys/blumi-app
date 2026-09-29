import type { ChatRepository } from "./chatRepository"

export type DeployEnvironment = "development" | "staging" | "production"

/**
 * Seeded test personas (migration 060) greet and auto-reply on behalf of fake
 * accounts. They exist for staging demos only; a production deployment must
 * never act for them even if the marker table was seeded by mistake.
 */
export function applyTestPersonaPolicy<Repository extends ChatRepository>(
  repository: Repository,
  deployEnvironment: DeployEnvironment
): Repository {
  if (deployEnvironment !== "production") return repository
  return {
    ...repository,
    async findTestPersona() {
      return null
    }
  }
}
