import {
  isRetryableConnectionDecisionError,
  type ConnectionDecisionResponse
} from "./connectionDecisionApi"
import {
  flushPendingConnectionDecisions,
  queueConnectionDecision,
  type ConnectionDecisionOutboxStorage,
  type PendingConnectionDecision
} from "./connectionDecisionOutbox"

export interface ConnectionDecisionDeliveryDependencies {
  storage: ConnectionDecisionOutboxStorage
  submit: (intent: PendingConnectionDecision) => Promise<ConnectionDecisionResponse>
  onDelivered?: (
    intent: PendingConnectionDecision,
    response: ConnectionDecisionResponse
  ) => Promise<void> | void
}

export interface QueueConnectionDecisionDeliveryInput {
  actorUserId: string
  miniRoomId: string
  partnerUserId: string
  status: PendingConnectionDecision["status"]
}

export async function queueConnectionDecisionDurably(
  dependencies: Pick<ConnectionDecisionDeliveryDependencies, "storage">,
  input: QueueConnectionDecisionDeliveryInput
): Promise<void> {
  await queueConnectionDecision(dependencies.storage, input)
}

export async function flushConnectionDecisionOutbox(
  dependencies: ConnectionDecisionDeliveryDependencies,
  actorUserId: string
): Promise<{ delivered: number; pending: number; rejectedMiniRoomIds: string[] }> {
  return flushPendingConnectionDecisions(
    dependencies.storage,
    actorUserId,
    async (intent) => {
      const response = await dependencies.submit(intent)
      await dependencies.onDelivered?.(intent, response)
    },
    isRetryableConnectionDecisionError
  )
}
