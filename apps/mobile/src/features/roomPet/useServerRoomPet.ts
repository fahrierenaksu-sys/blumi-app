import { useEffect, useRef, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { createAuthenticatedHeaders, requestJson } from "../network/apiClient"
import type { SessionActor } from "../session/sessionModel"
import { readServerRoomPetPresence, type ServerRoomPetPresence } from "./roomPetServerModel"

async function fetchServerRoomPetPresence(sessionToken: string): Promise<ServerRoomPetPresence> {
  const { response, payload } = await requestJson(
    MOBILE_HTTP_BASE_URL,
    "/v1/users/me/pet",
    { headers: createAuthenticatedHeaders(sessionToken) }
  )
  return readServerRoomPetPresence(response.status, payload)
}

/**
 * True only after the server confirmed this member's pet (it grants the
 * starter cat on the first read). Off, demo sessions, failures and older
 * servers all mean no pet: the app never invents one.
 */
export function useServerRoomPet(input: { sessionActor: SessionActor; isFocused: boolean; isEnabled: boolean }): boolean {
  const { sessionActor, isFocused } = input
  const isEnabled = input.isEnabled && sessionActor.session.mode === "production"
  const token = sessionActor.session.sessionToken
  const [presence, setPresence] = useState<ServerRoomPetPresence>("absent")
  const generation = useRef(0)

  useEffect(() => {
    const current = (generation.current += 1)
    if (!isEnabled || !token) {
      setPresence("absent")
      return
    }
    if (!isFocused) return
    fetchServerRoomPetPresence(token)
      .then((next) => { if (current === generation.current) setPresence(next) })
      // A failed read keeps what the server said last; the pet is a courtesy, never a blocker.
      .catch(() => undefined)
  }, [isEnabled, isFocused, token])

  return isEnabled && presence === "present"
}
