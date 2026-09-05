import type { MediaSessionToken, MiniRoom } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { captureAppException } from "../../observability/crashReporting"
import { createLivekitClient } from "./livekitClient"
import { closeOwnedMediaClient, createMicrophoneRequestGate, MediaClientOwnershipError } from "./livekitRoomLifecycle"
import {
  createInitialMiniRoomMediaState,
  type MiniRoomMediaState
} from "./miniRoomMediaState"

export interface UseMiniRoomMediaInput {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
}

export interface UseMiniRoomMediaResult {
  mediaState: MiniRoomMediaState
  retryConnect: () => Promise<void>
  toggleMic: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }
  return "Unable to connect to LiveKit."
}

export function useMiniRoomMedia(input: UseMiniRoomMediaInput): UseMiniRoomMediaResult {
  const { miniRoom, mediaSession } = input
  const roomInfo = useMemo(
    () => ({
      miniRoomId: miniRoom.miniRoomId,
      livekitRoomName: miniRoom.livekitRoomName,
      livekitUrl: mediaSession.livekitUrl
    }),
    [mediaSession.livekitUrl, miniRoom.livekitRoomName, miniRoom.miniRoomId]
  )

  const [mediaState, setMediaState] = useState<MiniRoomMediaState>(() =>
    createInitialMiniRoomMediaState(roomInfo)
  )

  const livekitClientRef = useRef<Awaited<ReturnType<typeof createLivekitClient>> | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const micRequestGateRef = useRef(createMicrophoneRequestGate())

  const runConnectAttempt = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setMediaState((previousState) => ({
      ...previousState,
      connectionStatus: "connecting",
      errorMessage: null,
      connectAttemptedAt: new Date().toISOString(),
      roomInfo
    }))

    try {
      await closeOwnedMediaClient(livekitClientRef)
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      if (!livekitClientRef.current) {
        const client = await createLivekitClient()
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          await client.disconnect()
          return
        }
        livekitClientRef.current = client
        client.subscribe((snapshot) => {
          if (!mountedRef.current || livekitClientRef.current !== client) return
          setMediaState((previous) => ({ ...previous,
            connectionStatus: snapshot.connectionStatus,
            errorMessage: snapshot.errorMessage,
            localMedia: { ...previous.localMedia, micEnabled: snapshot.micEnabled }
          }))
        })
      }

      await livekitClientRef.current.connect({
        livekitUrl: mediaSession.livekitUrl,
        token: mediaSession.token
      })

    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }

      setMediaState((previousState) => ({
        ...previousState,
        connectionStatus: "error",
        ...(error instanceof MediaClientOwnershipError && error.micEnabled !== undefined
          ? { localMedia: { ...previousState.localMedia, micEnabled: error.micEnabled } } : {}),
        errorMessage: getErrorMessage(error)
      }))
    }
  }, [mediaSession.livekitUrl, mediaSession.token, roomInfo])

  const retryConnect = useCallback(async () => {
    await runConnectAttempt()
  }, [runConnectAttempt])

  const toggleMic = useCallback(async (): Promise<void> => {
    const client = livekitClientRef.current
    if (!client || mediaState.connectionStatus !== "connected") return
    const finishRequest = micRequestGateRef.current.begin(client)
    if (!finishRequest) return
    const nextEnabled = !mediaState.localMedia.micEnabled
    try {
      await client.setMicrophoneEnabled(nextEnabled)
    } catch { /* The client publishes the confirmed SDK state and error. */ }
    finally { finishRequest() }
  }, [mediaState.connectionStatus, mediaState.localMedia.micEnabled])

  useEffect(() => {
    mountedRef.current = true
    void runConnectAttempt()

    return () => {
      mountedRef.current = false
      requestIdRef.current = requestIdRef.current + 1
      void closeOwnedMediaClient(livekitClientRef).catch(() => {
        captureAppException(new Error("Media room cleanup failed."), { feature: "mini_room_media" })
      })
    }
  }, [roomInfo, runConnectAttempt])

  return {
    mediaState,
    retryConnect,
    toggleMic
  }
}
