import { IS_BLUMI_MEDIA_DEMO_MODE } from "../../config/env"
import { createMediaClientRegistry, createRoomMediaClient, type MediaRoomLike, type RoomMediaSnapshot } from "./livekitRoomLifecycle"

interface LivekitModuleLike {
  registerGlobals?: () => void
}

interface LivekitClientModuleLike {
  Room: new () => MediaRoomLike
}

export interface LivekitConnectInput {
  livekitUrl: string
  token: string
}

export interface LivekitClient {
  getSnapshot: () => RoomMediaSnapshot
  subscribe: (listener: (state: RoomMediaSnapshot) => void) => () => void
  connect: (input: LivekitConnectInput) => Promise<void>
  disconnect: () => Promise<void>
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>
}

function ensureDomException(): void {
  if (typeof globalThis.DOMException !== "undefined") {
    return
  }

  const FallbackDOMException = class DOMException extends Error {
    public constructor(message = "", name = "Error") {
      super(message)
      this.name = name
    }
  }

  globalThis.DOMException = FallbackDOMException as unknown as typeof DOMException
}

function loadLivekitModule(): LivekitModuleLike {
  ensureDomException()
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  return require("@livekit/react-native") as LivekitModuleLike
}

function loadLivekitClientModule(): LivekitClientModuleLike {
  ensureDomException()
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  return require("livekit-client") as LivekitClientModuleLike
}

function createDemoLivekitClient(): LivekitClient {
  const listeners = new Set<(state: RoomMediaSnapshot) => void>()
  let state: RoomMediaSnapshot = { connectionStatus: "idle", micEnabled: false, errorMessage: null }
  const emit = () => { for (const listener of listeners) listener(state) }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener) } },
    async connect(): Promise<void> {
      state = { ...state, connectionStatus: "connected", micEnabled: false }; emit()
    },
    async disconnect(): Promise<void> {
      listeners.clear()
    },
    async setMicrophoneEnabled(enabled: boolean): Promise<void> {
      state = { ...state, micEnabled: enabled }; emit()
    },
  }
}

const mediaClientRegistry = createMediaClientRegistry()

export function createLivekitClient(): Promise<LivekitClient> {
  return mediaClientRegistry.acquire(createUnownedLivekitClient)
}

function createUnownedLivekitClient(): LivekitClient {
  if (IS_BLUMI_MEDIA_DEMO_MODE) {
    return createDemoLivekitClient()
  }

  const livekitModule = loadLivekitModule()
  livekitModule.registerGlobals?.()
  const livekitClientModule = loadLivekitClientModule()
  const room = new livekitClientModule.Room()

  return createRoomMediaClient(room)
}
