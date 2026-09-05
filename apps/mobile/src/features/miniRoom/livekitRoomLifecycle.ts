import type { MiniRoomConnectionStatus } from "./miniRoomMediaState"

interface DisconnectableMediaClient { disconnect(): Promise<void> }
const pendingDisconnects = new WeakMap<DisconnectableMediaClient, Promise<void>>()

export async function closeOwnedMediaClient<T extends DisconnectableMediaClient>(owner: { current: T | null }): Promise<void> {
  const client = owner.current
  if (!client) return
  let closing = pendingDisconnects.get(client)
  if (!closing) {
    closing = Promise.resolve().then(() => client.disconnect()).finally(() => { pendingDisconnects.delete(client) })
    pendingDisconnects.set(client, closing)
  }
  await closing
  if (owner.current === client) owner.current = null
}

export class MediaClientOwnershipError extends Error {
  constructor(readonly micEnabled: boolean | undefined) {
    super("Previous media connection could not be closed. Retry before entering another room.")
  }
}

/** Process-level capture ownership survives React unmounts; tests use fresh registries. */
export function createMediaClientRegistry() {
  const owner: { current: (DisconnectableMediaClient & { getSnapshot?: () => RoomMediaSnapshot }) | null } = { current: null }
  let queue: Promise<unknown> = Promise.resolve()
  return {
    acquire<T extends DisconnectableMediaClient & { getSnapshot?: () => RoomMediaSnapshot }>(factory: () => T): Promise<T> {
      const acquisition = queue.then(async () => {
        try { await closeOwnedMediaClient(owner) }
        catch { throw new MediaClientOwnershipError(owner.current?.getSnapshot?.().micEnabled) }
        const client = factory()
        const wrapped: T = { ...client, async disconnect() {
          await client.disconnect()
          if (owner.current === wrapped) owner.current = null
        } }
        owner.current = wrapped
        return wrapped
      })
      queue = acquisition.catch(() => undefined)
      return acquisition
    }
  }
}

export function createMicrophoneRequestGate() {
  let pending: { client: object } | null = null
  return {
    begin(client: object): (() => void) | null {
      if (pending?.client === client) return null
      const operation = { client }
      pending = operation
      return () => { if (pending === operation) pending = null }
    }
  }
}

export interface RoomMediaSnapshot {
  connectionStatus: MiniRoomConnectionStatus
  micEnabled: boolean
  errorMessage: string | null
}
export interface MediaRoomLike {
  state: string
  connect(url: string, token: string): Promise<void>
  disconnect(): void | Promise<void>
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off(event: string, listener: (...args: unknown[]) => void): unknown
  localParticipant: {
    isMicrophoneEnabled: boolean
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>
  }
}

/** LiveKit 2.x event boundary. UI reads confirmed SDK state, never requested intent. */
export function createRoomMediaClient(room: MediaRoomLike) {
  const listeners = new Set<(state: RoomMediaSnapshot) => void>()
  let status: MiniRoomConnectionStatus = "idle"
  let errorMessage: string | null = null
  let allowMicrophone = false
  let disposed = false
  let closing = false
  let generation = 0
  let muting: Promise<void> | null = null
  let connectionWork: Promise<void> | null = null
  let microphoneWork: Promise<void> | null = null
  const snapshot = (): RoomMediaSnapshot => ({ connectionStatus: status,
    // Transport failure does not prove capture stopped: a failed mute followed
    // by a failed disconnect must still expose the SDK's active microphone.
    micEnabled: room.localParticipant.isMicrophoneEnabled,
    errorMessage })
  const emit = () => { if (!disposed) for (const listener of listeners) listener(snapshot()) }
  const fail = (error: unknown) => {
    status = "error"
    errorMessage = error instanceof Error ? error.message : "Media connection failed."
    allowMicrophone = false
    emit()
  }
  const forceMuted = (): Promise<void> => {
    if (muting) return muting
    muting = Promise.resolve().then(() => room.localParticipant.setMicrophoneEnabled(false))
      .then(() => undefined)
      .catch(async (error: unknown) => { fail(error); await room.disconnect(); throw error })
      .finally(() => { muting = null; emit() })
    return muting
  }
  const reconnecting = () => {
    generation++
    allowMicrophone = false
    status = "connecting"
    emit()
    void forceMuted().catch(() => undefined)
  }
  const connected = () => {
    const attempt = generation
    void forceMuted().then(() => {
      if (!disposed && attempt === generation && room.state === "connected" && status !== "error") {
        status = "connected"; errorMessage = null; emit()
      }
    }).catch(() => undefined)
  }
  const disconnected = () => {
    generation++; allowMicrophone = false; status = "disconnected"; emit()
  }
  const trackChanged = () => {
    if (!allowMicrophone && room.localParticipant.isMicrophoneEnabled) void forceMuted().catch(() => undefined)
    emit()
  }
  const stateChanged = (state: unknown) => {
    if (state === "reconnecting" || state === "signalReconnecting") reconnecting()
    else if (state === "disconnected") disconnected()
    else if (state === "connected" && status !== "connected") connected()
    else if (state === "connecting") { status = "connecting"; emit() }
  }
  const handlers: [string, (...args: unknown[]) => void][] = [
    ["connectionStateChanged", stateChanged], ["reconnecting", reconnecting], ["signalReconnecting", reconnecting],
    ["reconnected", connected], ["disconnected", disconnected], ["trackMuted", trackChanged],
    ["trackUnmuted", trackChanged], ["localTrackPublished", trackChanged], ["localTrackUnpublished", trackChanged],
    ["mediaDevicesError", (error) => { errorMessage = error instanceof Error ? error.message : "Microphone unavailable."; emit() }]
  ]
  handlers.forEach(([event, handler]) => room.on(event, handler))
  return {
    getSnapshot: snapshot,
    subscribe(listener: (state: RoomMediaSnapshot) => void) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener) } },
    async connect(input: { livekitUrl: string; token: string }) {
      if (disposed || closing) throw new Error("Media client is closing or disposed.")
      status = "connecting"; allowMicrophone = false; errorMessage = null; emit()
      const work = (async () => {
        await room.connect(input.livekitUrl, input.token)
        if (disposed || closing) { await room.disconnect(); return }
        await forceMuted()
      })()
      connectionWork = work
      try { await work }
      catch (error) { fail(error); throw error }
      finally { if (connectionWork === work) connectionWork = null }
    },
    async setMicrophoneEnabled(enabled: boolean) {
      if (status !== "connected" || closing || disposed) return
      if (microphoneWork) return microphoneWork
      const attempt = generation
      allowMicrophone = enabled
      const work = (async () => {
        await room.localParticipant.setMicrophoneEnabled(enabled)
        if (attempt !== generation || !allowMicrophone || disposed) {
          await forceMuted()
          // An earlier mute may have completed just before the stale enable.
          if (room.localParticipant.isMicrophoneEnabled) await forceMuted()
        }
        emit()
      })()
      microphoneWork = work
      try { await work }
      catch (error) { allowMicrophone = false; errorMessage = error instanceof Error ? error.message : "Microphone unavailable."; emit(); throw error }
      finally { if (microphoneWork === work) microphoneWork = null }
    },
    async disconnect() {
      closing = true; generation++; allowMicrophone = false
      try {
        await room.disconnect()
        // A late native connect must finish (and close again) before another
        // hook may acquire capture ownership from the process registry.
        await connectionWork
        await microphoneWork
        await muting
        disposed = true
        handlers.forEach(([event, handler]) => room.off(event, handler))
        listeners.clear()
      } catch (error) { fail(error); throw error }
      finally { closing = false }
    }
  }
}
