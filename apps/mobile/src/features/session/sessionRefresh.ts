import {
  normalizeOnboardingStatus,
  normalizeSessionActor,
  type SessionActor
} from "./sessionModel"

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

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl
  return `${trimmed}${path}`
}

export async function refreshSession(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SessionActor> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/auth/refresh"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Sign in again to continue."))
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

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? ((payload as Record<string, unknown>).error as string)
    : fallback
}
