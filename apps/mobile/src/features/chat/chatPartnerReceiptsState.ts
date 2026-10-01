import type { ChatPartnerReceipts } from "@blumi/contracts"

// The partner's delivery/read cursors per thread, as the server disclosed them.
// Replaced, never mutated, so a snapshot holding the old map stays consistent.
let partnerReceiptsByThread: Map<string, ChatPartnerReceipts> = new Map()

export function getPartnerReceipts(threadId: string): ChatPartnerReceipts | undefined {
  return partnerReceiptsByThread.get(threadId)
}

export function setPartnerReceipts(threadId: string, receipts: ChatPartnerReceipts | undefined): void {
  if (receipts === partnerReceiptsByThread.get(threadId)) return
  partnerReceiptsByThread = new Map(partnerReceiptsByThread)
  if (receipts) partnerReceiptsByThread.set(threadId, receipts)
  else partnerReceiptsByThread.delete(threadId)
}

export function forgetPartnerReceipts(removedThreadIds: ReadonlySet<string>): void {
  partnerReceiptsByThread = new Map([...partnerReceiptsByThread].filter(([threadId]) => !removedThreadIds.has(threadId)))
}

/** Account switch or sign-out. */
export function resetPartnerReceipts(): void {
  partnerReceiptsByThread = new Map()
}
