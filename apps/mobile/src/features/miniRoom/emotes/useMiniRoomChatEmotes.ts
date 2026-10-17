import { useCallback, useEffect, useRef, useState } from "react"
import { IS_BLUMI_CHAT_EMOTES_ENABLED } from "../../../config/env"
import { decideChatEmote, EMPTY_CHAT_EMOTE_GATE, type ChatEmote } from "./chatEmoteMapper"
import {
  EMPTY_MINI_ROOM_EMOTES,
  expireMiniRoomEmotes,
  nextMiniRoomEmoteExpiry,
  showMiniRoomEmote,
  type MiniRoomEmotes
} from "./miniRoomEmoteModel"

/** The wave and every emote last this long (re-exported for the scene). */
export { MINI_ROOM_EMOTE_LIFETIME_MS } from "./miniRoomEmoteModel"

export interface MiniRoomChatEmoteMessage {
  senderUserId: string
  body: string
  /** Server send time of an incoming line; omitted for a line this phone just sent. */
  sentAtMs?: number
}

interface UseMiniRoomChatEmotesInput {
  /** Defaults to EXPO_PUBLIC_BLUMI_CHAT_EMOTES; off means nothing is read and nothing is shown. */
  enabled?: boolean
  /** Runs once per emote as it appears (the scene plays the wave gesture from here). */
  onEmote?: (speakerUserId: string, emote: ChatEmote) => void
}

export interface MiniRoomChatEmotes {
  emotes: MiniRoomEmotes
  /** Hands one shown chat line to the emote gate. The text is read and dropped. */
  noteChatMessage: (message: MiniRoomChatEmoteMessage) => void
}

/**
 * The room's emotes, derived on this phone from the lines it shows (its own
 * sent line and the partner's delivered one). One timer ends the next emote.
 */
export function useMiniRoomChatEmotes(input: UseMiniRoomChatEmotesInput): MiniRoomChatEmotes {
  const enabled = input.enabled ?? IS_BLUMI_CHAT_EMOTES_ENABLED
  const gateRef = useRef(EMPTY_CHAT_EMOTE_GATE)
  const counterRef = useRef(0)
  const onEmoteRef = useRef(input.onEmote)
  useEffect(() => {
    onEmoteRef.current = input.onEmote
  }, [input.onEmote])
  const [emotes, setEmotes] = useState<MiniRoomEmotes>(EMPTY_MINI_ROOM_EMOTES)

  useEffect(() => {
    const expiry = nextMiniRoomEmoteExpiry(emotes)
    if (expiry === undefined) return
    const timer = setTimeout(
      () => setEmotes((current) => expireMiniRoomEmotes(current, Date.now())),
      Math.max(0, expiry - Date.now())
    )
    return () => clearTimeout(timer)
  }, [emotes])

  const noteChatMessage = useCallback((message: MiniRoomChatEmoteMessage): void => {
    if (!enabled) return
    const now = Date.now()
    const decision = decideChatEmote(gateRef.current, {
      senderUserId: message.senderUserId,
      body: message.body,
      nowMs: now,
      sentAtMs: message.sentAtMs
    })
    gateRef.current = decision.state
    const emote = decision.emote
    if (!emote) return
    counterRef.current += 1
    const key = `emote_${counterRef.current}`
    setEmotes((current) => showMiniRoomEmote(current, { key, speakerUserId: message.senderUserId, emote }, now))
    onEmoteRef.current?.(message.senderUserId, emote)
  }, [enabled])

  return { emotes, noteChatMessage }
}
