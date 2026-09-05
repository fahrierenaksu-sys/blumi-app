import {
  normalizeStoredSessionActor,
  type SessionActor
} from "./sessionModel"

export const SESSION_ACTOR_STORAGE_KEY = "blumi.mobile.session_actor.v1"
export const DEMO_SESSION_ACTOR_STORAGE_KEY = "blumi.mobile.demo_session_actor.v1"
export const NATIVE_SESSION_CLEARED_STORAGE_KEY = "blumi.mobile.native_session_cleared.v1"

export interface SessionKeyValueStore {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

export interface SessionPersistenceDependencies {
  platform: "native" | "web"
  asyncStore: SessionKeyValueStore
  secureStore?: SessionKeyValueStore
  now?: () => number
}

export interface SessionPersistence {
  load: () => Promise<SessionActor | null>
  save: (actor: SessionActor) => Promise<void>
  clear: (mode?: SessionActor["session"]["mode"]) => Promise<void>
}

export class SecureSessionStorageUnavailableError extends Error {
  readonly code = "secure_session_storage_unavailable"

  constructor() {
    super("Secure session storage is unavailable")
    this.name = "SecureSessionStorageUnavailableError"
  }
}

export function getSecureSessionStorageRecoveryMessage(
  error: unknown
): string | null {
  return error instanceof SecureSessionStorageUnavailableError
    ? "Blumi couldn't access secure sign-in storage. Restart Blumi, then try again."
    : null
}

export function createSessionPersistence(
  dependencies: SessionPersistenceDependencies
): SessionPersistence {
  const now = dependencies.now ?? Date.now

  return {
    load: async () => {
      if (dependencies.platform === "native") {
        const storedDemo = await dependencies.asyncStore.getItem(
          DEMO_SESSION_ACTOR_STORAGE_KEY
        )
        if (storedDemo) {
          const demoActor = await parseStoredActor(
            storedDemo,
            now,
            dependencies.asyncStore,
            DEMO_SESSION_ACTOR_STORAGE_KEY
          )
          if (demoActor?.session.mode === "demo") return demoActor
          await dependencies.asyncStore.removeItem(DEMO_SESSION_ACTOR_STORAGE_KEY)
        }

        if (
          (await dependencies.asyncStore.getItem(
            NATIVE_SESSION_CLEARED_STORAGE_KEY
          )) === "true"
        ) {
          await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
          return null
        }

        const legacyValue = await dependencies.asyncStore.getItem(
          SESSION_ACTOR_STORAGE_KEY
        )
        const secureStore = requireSecureStore(dependencies.secureStore)
        try {
          const secureValue = await secureStore.getItem(SESSION_ACTOR_STORAGE_KEY)
          if (secureValue) {
            const secureActor = await parseStoredActor(
              secureValue,
              now,
              secureStore
            )
            if (secureActor) return secureActor
          }
        } catch (error) {
          if (!isCredentialStoreUnavailable(error)) throw error
          const demoActor = await recoverLegacyDemoWithoutCredentialStore(
            legacyValue,
            dependencies.asyncStore,
            now
          )
          if (demoActor) return demoActor
          throw new SecureSessionStorageUnavailableError()
        }

        if (!legacyValue) return null

        const actor = await parseStoredActor(
          legacyValue,
          now,
          dependencies.asyncStore
        )
        if (!actor) return null

        if (actor.session.mode === "demo") {
          await dependencies.asyncStore.setItem(
            DEMO_SESSION_ACTOR_STORAGE_KEY,
            JSON.stringify(actor)
          )
          await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
          return actor
        }

        try {
          await secureStore.setItem(
            SESSION_ACTOR_STORAGE_KEY,
            JSON.stringify(actor)
          )
        } catch (error) {
          if (!isCredentialStoreUnavailable(error)) throw error
          await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
          throw new SecureSessionStorageUnavailableError()
        }
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
        return actor
      }

      const webValue = await dependencies.asyncStore.getItem(
        SESSION_ACTOR_STORAGE_KEY
      )
      if (!webValue) return null

      const actor = await parseStoredActor(
        webValue,
        now,
        dependencies.asyncStore
      )
      if (!actor) return null

      if (actor.session.mode === "production") {
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
        return null
      }

      return actor
    },
    save: async (actor) => {
      if (dependencies.platform === "native") {
        if (actor.session.mode === "demo") {
          await dependencies.asyncStore.setItem(
            DEMO_SESSION_ACTOR_STORAGE_KEY,
            JSON.stringify(actor)
          )
          await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
          await dependencies.asyncStore.setItem(
            NATIVE_SESSION_CLEARED_STORAGE_KEY,
            "true"
          )
          return
        }

        const secureStore = requireSecureStore(dependencies.secureStore)
        try {
          await secureStore.setItem(
            SESSION_ACTOR_STORAGE_KEY,
            JSON.stringify(actor)
          )
        } catch (error) {
          if (!isCredentialStoreUnavailable(error)) throw error
          await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
          throw new SecureSessionStorageUnavailableError()
        }
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
        await dependencies.asyncStore.removeItem(DEMO_SESSION_ACTOR_STORAGE_KEY)
        await dependencies.asyncStore.removeItem(NATIVE_SESSION_CLEARED_STORAGE_KEY)
        return
      }

      if (actor.session.mode === "demo") {
        await dependencies.asyncStore.setItem(
          SESSION_ACTOR_STORAGE_KEY,
          JSON.stringify(actor)
        )
      } else {
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
      }
    },
    clear: async (mode) => {
      if (mode === "demo") {
        await dependencies.asyncStore.removeItem(DEMO_SESSION_ACTOR_STORAGE_KEY)
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
        await dependencies.asyncStore.setItem(
          NATIVE_SESSION_CLEARED_STORAGE_KEY,
          "true"
        )
        return
      }

      if (dependencies.platform === "native") {
        await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
        await dependencies.asyncStore.removeItem(DEMO_SESSION_ACTOR_STORAGE_KEY)
        try {
          await requireSecureStore(dependencies.secureStore).removeItem(
            SESSION_ACTOR_STORAGE_KEY
          )
        } catch (error) {
          if (!isCredentialStoreUnavailable(error)) throw error
          await dependencies.asyncStore.setItem(
            NATIVE_SESSION_CLEARED_STORAGE_KEY,
            "true"
          )
          throw new SecureSessionStorageUnavailableError()
        }
        await dependencies.asyncStore.removeItem(NATIVE_SESSION_CLEARED_STORAGE_KEY)
        return
      }
      await dependencies.asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
      await dependencies.asyncStore.removeItem(DEMO_SESSION_ACTOR_STORAGE_KEY)
      await dependencies.asyncStore.removeItem(NATIVE_SESSION_CLEARED_STORAGE_KEY)
    }
  }
}

async function recoverLegacyDemoWithoutCredentialStore(
  legacyValue: string | null,
  asyncStore: SessionKeyValueStore,
  now: () => number
): Promise<SessionActor | null> {
  if (!legacyValue) return null

  const actor = await parseStoredActor(
    legacyValue,
    now,
    asyncStore
  )
  if (actor?.session.mode === "demo") {
    await asyncStore.setItem(
      DEMO_SESSION_ACTOR_STORAGE_KEY,
      JSON.stringify(actor)
    )
    await asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
    return actor
  }

  await asyncStore.removeItem(SESSION_ACTOR_STORAGE_KEY)
  return null
}

function isCredentialStoreUnavailable(error: unknown): boolean {
  if (error instanceof SecureSessionStorageUnavailableError) return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("required entitlement isn't present") ||
    message.includes("no keychain is available") ||
    message.includes("keychain is unavailable") ||
    message.includes("credential store is unavailable")
  )
}

async function parseStoredActor(
  rawValue: string,
  now: () => number,
  sourceStore: SessionKeyValueStore,
  storageKey = SESSION_ACTOR_STORAGE_KEY
): Promise<SessionActor | null> {
  try {
    const parsed: unknown = JSON.parse(rawValue)
    const actor = normalizeStoredSessionActor(parsed)
    if (!actor || isExpired(actor, now())) {
      await sourceStore.removeItem(storageKey)
      return null
    }
    return actor
  } catch (error) {
    if (error instanceof SyntaxError) {
      await sourceStore.removeItem(storageKey)
      return null
    }
    throw error
  }
}

function isExpired(actor: SessionActor, now: number): boolean {
  const expiresAtMs = new Date(actor.session.expiresAt).getTime()
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now
}

function requireSecureStore(
  secureStore: SessionKeyValueStore | undefined
): SessionKeyValueStore {
  if (!secureStore) {
    throw new SecureSessionStorageUnavailableError()
  }
  return secureStore
}
