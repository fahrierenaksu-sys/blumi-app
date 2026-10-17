import type { StreetResponse, StreetWindow } from "@blumi/contracts"
import { useCallback, useEffect, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import type { SessionActor } from "../session/sessionModel"
import { fetchStreet } from "./streetApi"
import { readStreetDeviceState, writeStreetDeviceState } from "./streetDeviceStore"
import {
  EMPTY_STREET_DEVICE_STATE,
  markStreetWindowOpened,
  reconcileStreetDeviceState,
  type StreetDeviceState
} from "./streetModel"

interface StreetState {
  owner: string
  street: StreetResponse | null
  device: StreetDeviceState
}

/**
 * The street for this session. Nothing is fetched while `enabled` is false (the `chat_street` capability), and a 404
 * keeps it empty, so the Chats tab renders exactly as before. Refetched with the thread list (`refreshKey`).
 */
export function useStreet(input: { sessionActor: SessionActor; enabled: boolean; refreshKey: string }) {
  const { sessionActor, enabled, refreshKey } = input
  const owner = sessionActor.profile.userId
  const sessionToken = sessionActor.session.sessionToken
  const eligible = enabled && sessionActor.session.mode === "production"
  const [stored, setStored] = useState<StreetState>({ owner, street: null, device: EMPTY_STREET_DEVICE_STATE })
  const state = stored.owner === owner ? stored : { owner, street: null, device: EMPTY_STREET_DEVICE_STATE }

  useEffect(() => {
    if (!eligible) return
    const controller = new AbortController()
    void Promise.all([fetchStreet(MOBILE_HTTP_BASE_URL, sessionToken, undefined, controller.signal), readStreetDeviceState(owner)])
      .then(([result, device]) => {
        if (controller.signal.aborted) return
        if (result.kind === "off") {
          setStored({ owner, street: null, device })
          return
        }
        const reconciled = reconcileStreetDeviceState(device, result.street)
        setStored({ owner, street: result.street, device: reconciled })
        void writeStreetDeviceState(owner, reconciled)
      })
      // The street is an extra above the list: a failed fetch keeps the last answer and the list works as before.
      .catch(() => undefined)
    return () => controller.abort()
  }, [eligible, owner, refreshKey, sessionToken])

  const updateDevice = useCallback((change: (device: StreetDeviceState) => StreetDeviceState) => {
    setStored((current) => {
      if (current.owner !== owner) return current
      const device = change(current.device)
      void writeStreetDeviceState(owner, device)
      return { ...current, device }
    })
  }, [owner])

  const markOpened = useCallback((window: StreetWindow, edition: string) => {
    updateDevice((device) => markStreetWindowOpened(device, window, edition))
  }, [updateDevice])
  const markInfoSeen = useCallback(() => updateDevice((device) => ({ ...device, infoCardSeen: true })), [updateDevice])
  const markWoke = useCallback((edition: string) => updateDevice((device) => ({ ...device, wakeEdition: edition })), [updateDevice])

  return { street: eligible ? state.street : null, device: state.device, markOpened, markInfoSeen, markWoke }
}
