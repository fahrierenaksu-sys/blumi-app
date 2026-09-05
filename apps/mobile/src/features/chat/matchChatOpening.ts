import type { ChatThread } from "@blumi/contracts"
import { getMatchChatOpenErrorMessageForDisplay } from "./chatErrorCopy"

export type MatchChatOpenResult =
  | { status: "opened"; thread: ChatThread }
  | { status: "failed"; errorMessage: string }

export async function openMatchedChat(input: {
  createThread: () => Promise<ChatThread>
  onThreadReady: (thread: ChatThread) => void
}): Promise<MatchChatOpenResult> {
  try {
    const thread = await input.createThread()
    input.onThreadReady(thread)
    return { status: "opened", thread }
  } catch (error) {
    return {
      status: "failed",
      errorMessage: getMatchChatOpenErrorMessageForDisplay(
        error instanceof Error ? error.message : ""
      )
    }
  }
}
