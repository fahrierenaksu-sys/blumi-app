// Server id -> the optimistic bubble's local id it replaced. The timeline keys
// a confirmed message by its first local id, so the row is updated in place
// (its entrance keeps playing) instead of remounting under a new key (CHT-04).
let renderKeyByMessageId: Map<string, string> = new Map()

/** Stable list key of a message: the local id it was first shown under, else its id. */
export function getMessageRenderKey(messageId: string): string {
  return renderKeyByMessageId.get(messageId) ?? messageId
}

export function keepLocalRenderKey(serverMessageId: string, localMessageId: string): void {
  renderKeyByMessageId.set(serverMessageId, renderKeyByMessageId.get(localMessageId) ?? localMessageId)
}

/** Account switch or sign-out: keys from the previous session must not leak. */
export function resetMessageRenderKeys(): void {
  renderKeyByMessageId = new Map()
}
