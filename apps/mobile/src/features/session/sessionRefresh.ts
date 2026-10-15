import {
  normalizeOnboardingStatus,
  normalizeSessionActor,
  type SessionActor
} from "./sessionModel"
import { requestJson } from "../network/apiClient"
import {
  createApiRequestError,
  SESSION_INVALID_STATUS
} from "../network/apiRequestError"

interface SessionRefreshPersistence {
  save: (actor: SessionActor) => Promise<void>
}

export class SessionRefreshCancelledError extends Error {
  constructor() {
    super("Session refresh cancelled")
    this.name = "SessionRefreshCancelledError"
  }
}

export interface SessionRefreshCoordinator {
  refresh(actor: SessionActor): Promise<SessionActor>
  cancelAndWait(): Promise<void>
}

export async function refreshSession(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SessionActor> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/auth/refresh", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    signal
  }, fetcher)

  if (!response.ok) {
    // Callers decide by the typed status code: only a verified invalid
    // session (a readable 401 from the Blumi API) may clear the stored
    // session. Gateway, rate-limit and server errors keep it.
    throw createApiRequestError(
      response.status,
      payload,
      response.status === SESSION_INVALID_STATUS
        ? "Sign in again to continue."
        : "Blumi could not refresh your secure session."
    )
  }

  const actor = normalizeSessionActor(payload, {
    requireExplicitIdentity: true,
    requiredMode: "production"
  })
  if (!actor || actor.session.mode !== "production") {
    throw new Error("Blumi could not refresh your secure session.")
  }
  const explicitOnboarding = normalizeOnboardingStatus(
    (payload as { session?: { onboarding?: unknown } } | null)
      ?.session?.onboarding
  )
  if (!explicitOnboarding) {
    throw new Error("Blumi could not confirm your account onboarding status.")
  }
  return actor
}

export async function refreshAndPersistSession(
  baseHttpUrl: string,
  currentActor: SessionActor,
  dependencies: {
    fetcher?: typeof fetch
    persistence?: SessionRefreshPersistence
    signal?: AbortSignal
  } = {}
): Promise<SessionActor> {
  const refreshedActor = await refreshSession(
    baseHttpUrl,
    currentActor.session.sessionToken,
    dependencies.fetcher ?? fetch,
    dependencies.signal
  )
  if (
    refreshedActor.session.userId !== currentActor.session.userId ||
    refreshedActor.session.accountId !== currentActor.session.accountId
  ) {
    throw new Error("Blumi could not refresh your session safely.")
  }
  const actor: SessionActor = refreshedActor
  if (dependencies.persistence) {
    await dependencies.persistence.save(actor)
  } else {
    const { saveSessionActor } = await import("./sessionStorage")
    await saveSessionActor(actor)
  }
  return actor
}

export function createSessionRefreshCoordinator(
  run: (actor: SessionActor, signal: AbortSignal) => Promise<SessionActor>
): SessionRefreshCoordinator {
  let generation = 0
  let inFlight: {
    userId: string
    controller: AbortController
    promise: Promise<SessionActor>
  } | null = null

  return {
    refresh(actor) {
      if (inFlight) {
        if (inFlight.userId !== actor.session.userId) {
          return Promise.reject(
            new Error("Blumi could not refresh your session safely.")
          )
        }
        return inFlight.promise
      }

      const startedGeneration = generation
      const controller = new AbortController()
      const promise = run(actor, controller.signal)
        .then((refreshedActor) => {
          if (startedGeneration !== generation) {
            throw new SessionRefreshCancelledError()
          }
          return refreshedActor
        })
        .finally(() => {
          if (inFlight?.promise === promise) inFlight = null
        })
      inFlight = {
        userId: actor.session.userId,
        controller,
        promise
      }
      return promise
    },
    async cancelAndWait() {
      generation += 1
      const active = inFlight
      if (!active) return
      active.controller.abort()
      try {
        await active.promise
      } catch {
        // Logout owns the final local clear; cancellation and network errors
        // must not prevent it.
      }
    }
  }
}

export function isSessionRefreshCancelled(
  error: unknown
): error is SessionRefreshCancelledError {
  return error instanceof SessionRefreshCancelledError
}

export function shouldRefreshSessionSoon(
  actor: SessionActor,
  nowMs = Date.now(),
  thresholdMs = 24 * 60 * 60 * 1000
): boolean {
  if (actor.session.mode !== "production") return false
  const expiresAtMs = new Date(actor.session.expiresAt).getTime()
  if (!Number.isFinite(expiresAtMs)) return true
  return expiresAtMs - nowMs <= thresholdMs
}
