/**
 * One worker thread of simulated phones. Each simulated user runs the real
 * `@blumi/realtime-client` state machine (ticket, reconnect policy, liveness,
 * validated events) over a `ws` socket that carries an X-Forwarded-For
 * address, so per-address limits see realistic device and CGNAT addresses.
 *
 * Both participants of a MiniRoom or DM pair live in the same worker, so
 * sender and receiver timestamps come from one clock.
 */
import { randomUUID } from "node:crypto"
import { parentPort, workerData } from "node:worker_threads"
import WebSocket from "ws"
import type { ServerEvent } from "@blumi/contracts"
import {
  RealtimeClient,
  RealtimeTicketRequestError,
  type RealtimeConnectionStatus,
  type RealtimeSocket
} from "../../../../packages/realtime-client/src/index"

export interface SimulatedUser {
  userId: string
  sessionToken: string
  address: string
  role: "room" | "dm" | "idle"
  partnerUserId?: string
  miniRoomId?: string
  threadId?: string
  /** One of the pair sends chat so each pair has one message stream. */
  chatSender?: boolean
}

export interface WorkerConfig {
  httpUrl: string
  wsUrl: string
  users: SimulatedUser[]
  moveIntervalMs: number
  roomChatIntervalMs: number
  dmIntervalMs: number
  connectRatePerSecond: number
}

type Command =
  | { type: "connect" }
  | { type: "start-load" }
  | { type: "stop-load" }
  | { type: "storm-mark"; at: number }
  | { type: "report" }
  | { type: "shutdown" }

const config = workerData as WorkerConfig
const now = () => performance.timeOrigin + performance.now()

const samples: Record<string, number[]> = {
  move_e2e: [],
  room_chat_e2e: [],
  room_chat_ack: [],
  dm_chat_e2e: [],
  dm_chat_http: [],
  initial_connect: [],
  storm_reconnect: [],
  storm_first_thread_list: []
}
const counters: Record<string, number> = {
  moves_sent: 0,
  room_chats_sent: 0,
  dm_sent: 0,
  dm_http_errors: 0,
  ticket_errors: 0,
  ticket_429: 0,
  closes: 0,
  unexpected_closes_during_load: 0,
  close_4429: 0,
  close_1013: 0,
  close_1011: 0,
  close_4403: 0,
  chat_not_sent_errors: 0,
  unmatched_events: 0
}
const closeCodes: Record<string, number> = {}

const pendingMoves = new Map<string, number>()
const pendingRoomChats = new Map<string, number>()
const pendingAcks = new Map<string, number>()
const pendingDms = new Map<string, number>()

interface Simulated {
  user: SimulatedUser
  client: RealtimeClient
  status: RealtimeConnectionStatus
  sequence: number
  chatSequence: number
  connectStartedAt?: number
  stormPending: boolean
  threadListPendingSince?: number
  timers: ReturnType<typeof setInterval>[]
}

let loadRunning = false
let stormMarkAt: number | undefined
const simulated: Simulated[] = []

function createSocketFactory(address: string) {
  return (url: string, protocols: string[]): RealtimeSocket => {
    const socket = new WebSocket(url, protocols, {
      headers: { "x-forwarded-for": address },
      perMessageDeflate: false
    })
    const adapter: RealtimeSocket = {
      get readyState() { return socket.readyState },
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data: string) { socket.send(data) },
      close(code?: number, reason?: string) {
        try { socket.close(code, reason) } catch { socket.terminate() }
      }
    } as RealtimeSocket
    socket.on("open", () => adapter.onopen?.())
    socket.on("message", (data) => adapter.onmessage?.({ data: data.toString() }))
    socket.on("close", (code) => adapter.onclose?.({ code }))
    socket.on("error", () => adapter.onerror?.())
    return adapter
  }
}

function createTicketProvider(address: string) {
  return async (sessionToken: string): Promise<string> => {
    const response = await fetch(`${config.httpUrl}/v1/auth/realtime-ticket`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "x-forwarded-for": address },
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) {
      counters.ticket_errors = (counters.ticket_errors ?? 0) + 1
      if (response.status === 429) counters.ticket_429 = (counters.ticket_429 ?? 0) + 1
      throw new RealtimeTicketRequestError(response.status)
    }
    const payload = await response.json() as { ticket?: string }
    return payload.ticket ?? ""
  }
}

function handleEvent(entry: Simulated, event: ServerEvent): void {
  const receivedAt = now()
  const self = entry.user.userId
  switch (event.type) {
    case "mini_room.avatar_moved": {
      if (event.payload.avatar.userId === self) return
      const key = `${event.payload.avatar.userId}|${event.payload.avatar.x}`
      const sentAt = pendingMoves.get(key)
      if (sentAt === undefined) { counters.unmatched_events! += 1; return }
      pendingMoves.delete(key)
      samples.move_e2e!.push(receivedAt - sentAt)
      return
    }
    case "chat.message_received": {
      const payload = event.payload as { body: string; senderUserId: string; clientMessageId?: string }
      if (payload.senderUserId === self) {
        if (!payload.clientMessageId) return
        const sentAt = pendingAcks.get(payload.clientMessageId)
        if (sentAt === undefined) return
        pendingAcks.delete(payload.clientMessageId)
        samples.room_chat_ack!.push(receivedAt - sentAt)
        return
      }
      const roomSentAt = pendingRoomChats.get(payload.body)
      if (roomSentAt !== undefined) {
        pendingRoomChats.delete(payload.body)
        samples.room_chat_e2e!.push(receivedAt - roomSentAt)
        return
      }
      const dmSentAt = pendingDms.get(payload.body)
      if (dmSentAt !== undefined) {
        pendingDms.delete(payload.body)
        samples.dm_chat_e2e!.push(receivedAt - dmSentAt)
      }
      return
    }
    case "chat.thread_listed": {
      if (entry.threadListPendingSince !== undefined && stormMarkAt !== undefined) {
        samples.storm_first_thread_list!.push(receivedAt - stormMarkAt)
      }
      entry.threadListPendingSince = undefined
      return
    }
    case "realtime.error": {
      counters.chat_not_sent_errors! += 1
      return
    }
    default:
      return
  }
}

function onStatus(entry: Simulated, status: RealtimeConnectionStatus, closeCode?: number): void {
  const previous = entry.status
  entry.status = status
  if (status === "disconnected" && closeCode !== undefined) {
    counters.closes! += 1
    closeCodes[String(closeCode)] = (closeCodes[String(closeCode)] ?? 0) + 1
    if (loadRunning && stormMarkAt === undefined) counters.unexpected_closes_during_load! += 1
  }
  if (status !== "connected" || previous === "connected") return
  const at = now()
  if (entry.connectStartedAt !== undefined) {
    samples.initial_connect!.push(at - entry.connectStartedAt)
    entry.connectStartedAt = undefined
  }
  if (entry.stormPending && stormMarkAt !== undefined) {
    entry.stormPending = false
    samples.storm_reconnect!.push(at - stormMarkAt)
    entry.threadListPendingSince = at
  }
  // What the app does on every (re)connect.
  entry.client.send({ type: "chat.list_threads", payload: {} })
  if (entry.user.role === "room" && entry.user.miniRoomId) {
    entry.client.send({ type: "mini_room.scene_enter", payload: { miniRoomId: entry.user.miniRoomId } })
  }
}

/** First action at a random phase inside the interval, then every interval. */
function every(entry: Simulated, intervalMs: number, action: () => void): void {
  const phase = setTimeout(() => {
    action()
    entry.timers.push(setInterval(action, intervalMs))
  }, Math.random() * intervalMs)
  entry.timers.push(phase as unknown as ReturnType<typeof setInterval>)
}

function startLoad(entry: Simulated): void {
  const { user } = entry
  if (user.role === "room" && user.miniRoomId) {
    every(entry, config.moveIntervalMs, () => sendMove(entry))
    if (user.chatSender) every(entry, config.roomChatIntervalMs, () => sendRoomChat(entry))
  }
  if (user.role === "dm" && user.chatSender && user.threadId && config.dmIntervalMs > 0) {
    every(entry, config.dmIntervalMs, () => void sendDm(entry))
  }
}

function sendMove(entry: Simulated): void {
  if (!loadRunning || entry.status !== "connected") return
  entry.sequence += 1
  const x = Math.round((0.4 + (entry.sequence % 1000) * 0.0002) * 1e6) / 1e6
  const key = `${entry.user.userId}|${x}`
  pendingMoves.set(key, now())
  const sent = entry.client.send({
    type: "mini_room.move",
    payload: { miniRoomId: entry.user.miniRoomId!, sequence: entry.sequence, x, y: 0.7 }
  })
  if (sent) counters.moves_sent! += 1
  else pendingMoves.delete(key)
}

function sendRoomChat(entry: Simulated): void {
  if (!loadRunning || entry.status !== "connected") return
  entry.chatSequence += 1
  const body = `rc ${entry.user.userId.slice(-8)} ${entry.chatSequence}`
  const clientMessageId = randomUUID()
  const sentAt = now()
  pendingRoomChats.set(body, sentAt)
  pendingAcks.set(clientMessageId, sentAt)
  const sent = entry.client.send({
    type: "chat.send_message",
    payload: { threadId: entry.user.threadId!, body, clientMessageId }
  })
  if (sent) counters.room_chats_sent! += 1
  else { pendingRoomChats.delete(body); pendingAcks.delete(clientMessageId) }
}

async function sendDm(entry: Simulated): Promise<void> {
  if (!loadRunning) return
  entry.chatSequence += 1
  const body = `dm ${entry.user.userId.slice(-8)} ${entry.chatSequence}`
  const startedAt = now()
  pendingDms.set(body, startedAt)
  counters.dm_sent! += 1
  try {
    const response = await fetch(
      `${config.httpUrl}/v1/threads/${encodeURIComponent(entry.user.threadId!)}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${entry.user.sessionToken}`,
          "content-type": "application/json",
          "x-forwarded-for": entry.user.address
        },
        body: JSON.stringify({ body, clientMessageId: randomUUID() }),
        signal: AbortSignal.timeout(15_000)
      })
    await response.arrayBuffer()
    if (!response.ok) {
      counters.dm_http_errors! += 1
      pendingDms.delete(body)
      return
    }
    samples.dm_chat_http!.push(now() - startedAt)
  } catch {
    counters.dm_http_errors! += 1
    pendingDms.delete(body)
  }
}

async function connectAll(): Promise<void> {
  const perTick = Math.max(1, Math.round(config.connectRatePerSecond / 20))
  for (let index = 0; index < config.users.length; index += perTick) {
    for (const user of config.users.slice(index, index + perTick)) {
      const client = new RealtimeClient(config.wsUrl, createTicketProvider(user.address), {
        createSocket: createSocketFactory(user.address),
        onDroppedEvent: () => { counters.unmatched_events! += 1 }
      })
      const entry: Simulated = {
        user, client, status: "idle", sequence: 0, chatSequence: 0,
        connectStartedAt: now(), stormPending: false, timers: []
      }
      client.onServerEvent((event) => handleEvent(entry, event))
      client.onConnectionStatus((status, meta) => onStatus(entry, status, meta?.closeCode))
      simulated.push(entry)
      client.connect(user.sessionToken)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

parentPort?.on("message", (command: Command) => {
  switch (command.type) {
    case "connect":
      void connectAll().then(() => {
        const waitForAll = setInterval(() => {
          const connected = simulated.filter((entry) => entry.status === "connected").length
          if (connected === simulated.length) {
            clearInterval(waitForAll)
            parentPort?.postMessage({ type: "connected", count: connected })
          }
        }, 100)
      })
      return
    case "start-load":
      loadRunning = true
      for (const entry of simulated) startLoad(entry)
      parentPort?.postMessage({ type: "load-started" })
      return
    case "stop-load":
      loadRunning = false
      for (const entry of simulated) {
        for (const timer of entry.timers) clearInterval(timer)
        entry.timers = []
      }
      parentPort?.postMessage({ type: "load-stopped" })
      return
    case "storm-mark": {
      stormMarkAt = command.at
      for (const entry of simulated) entry.stormPending = true
      const waitForAll = setInterval(() => {
        const pending = simulated.filter((entry) => entry.stormPending).length
        const listed = simulated.filter((entry) => entry.threadListPendingSince !== undefined).length
        if (pending === 0 && listed === 0) {
          clearInterval(waitForAll)
          parentPort?.postMessage({ type: "storm-recovered", at: now() })
        }
      }, 50)
      return
    }
    case "report":
      parentPort?.postMessage({
        type: "report",
        samples,
        counters,
        closeCodes,
        connected: simulated.filter((entry) => entry.status === "connected").length,
        pending: {
          moves: pendingMoves.size,
          roomChats: pendingRoomChats.size,
          acks: pendingAcks.size,
          dms: pendingDms.size
        }
      })
      return
    case "shutdown":
      loadRunning = false
      for (const entry of simulated) {
        for (const timer of entry.timers) clearInterval(timer)
        entry.client.disconnect()
      }
      setTimeout(() => process.exit(0), 200)
      return
  }
})
