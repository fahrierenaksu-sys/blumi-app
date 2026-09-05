import AsyncStorage from "@react-native-async-storage/async-storage"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { submitConnectionDecision } from "./connectionDecisionApi"
import {
  flushConnectionDecisionOutbox as flushOutbox,
  queueConnectionDecisionDurably,
  type ConnectionDecisionDeliveryDependencies,
  type QueueConnectionDecisionDeliveryInput
} from "./connectionDecisionDelivery"
import { discardPendingConnectionDecision } from "./connectionDecisionOutbox"

interface AuthenticatedConnectionDecisionDeliveryInput extends QueueConnectionDecisionDeliveryInput {
  sessionToken: string
}

type AuthenticatedFlushInput = Pick<AuthenticatedConnectionDecisionDeliveryInput, "actorUserId" | "sessionToken"> & {
  onDelivered?: ConnectionDecisionDeliveryDependencies["onDelivered"]
}

type FlushResult = { delivered: number; pending: number; rejectedMiniRoomIds: string[] }

const activeFlushes = new Map<string, Promise<FlushResult>>()
const DELIVERY_TIMEOUT_MS = 6000

export async function queueConnectionDecisionForDelivery(
  input: QueueConnectionDecisionDeliveryInput
): Promise<void> {
  await queueConnectionDecisionDurably({ storage: AsyncStorage }, input)
}

export async function discardQueuedConnectionDecision(
  input: Pick<QueueConnectionDecisionDeliveryInput, "actorUserId" | "miniRoomId">
): Promise<void> {
  await discardPendingConnectionDecision(AsyncStorage, input.actorUserId, input.miniRoomId)
}

export function flushAuthenticatedConnectionDecisionOutbox(
  input: AuthenticatedFlushInput
): Promise<FlushResult> {
  const existing = activeFlushes.get(input.actorUserId)
  if (existing) return existing
  const flush = flushOutbox({
    storage: AsyncStorage,
    submit: (intent) => withDeliveryTimeout(() => submitConnectionDecision(
      MOBILE_HTTP_BASE_URL,
      input.sessionToken,
      intent
    )),
    onDelivered: input.onDelivered
  }, input.actorUserId)
  activeFlushes.set(input.actorUserId, flush)
  void flush.then(
    () => releaseActiveFlush(input.actorUserId, flush),
    () => releaseActiveFlush(input.actorUserId, flush)
  )
  return flush
}

function releaseActiveFlush(
  actorUserId: string,
  flush: Promise<FlushResult>
): void {
  if (activeFlushes.get(actorUserId) === flush) {
    activeFlushes.delete(actorUserId)
  }
}

function withDeliveryTimeout<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Connection decision delivery timed out."))
    }, DELIVERY_TIMEOUT_MS)
    void work().then(
      (result) => {
        clearTimeout(timeout)
        resolve(result)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}
