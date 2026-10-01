// Pins the typing indicator wiring (2026-10-01). Behaviour is proven by the
// node model, store and hook tests; these keep the surfaces honest: every
// indicator is fed by the server's chat.typing_updated through the store
// (never a local demo timer), motion runs on the UI thread, Reduce Motion
// comes from the shared store, and no typing data is persisted or logged.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (path) => readFileSync(resolve(srcRoot, path), "utf8")

test("chat and room indicators are driven only by the server event through the store", () => {
  const bubble = read("features/chat/typing/ChatTypingBubble.tsx")
  const partner = read("features/chat/typing/usePartnerTyping.ts")
  const session = read("navigation/useGlobalRealtimeSession.ts")
  const handler = read("features/realtime/globalRealtimeEventHandler.ts")
  const roomScreen = read("screens/MiniRoomScreen.tsx")
  assert.match(bubble, /usePartnerTyping\(threadId, partnerUserId, label\)/)
  assert.match(partner, /chatTypingStore\.subscribe/)
  assert.match(handler, /event\.type === "chat\.typing_updated"/)
  assert.match(session, /applyChatTypingUpdated: chatTypingStore\.applyUpdate/)
  assert.match(session, /clearChatTypingForMessage: chatTypingStore\.noteMessage/)
  assert.match(roomScreen, /usePartnerTyping\(roomChat\.threadId, participants\.partner\.userId/)
  for (const source of [bubble, partner]) assert.doesNotMatch(source, /setTimeout|setInterval/)
})

test("the composers report user edits, blur and send; the screens mount one bubble", () => {
  const screen = read("screens/ChatThreadScreen.tsx")
  const composer = read("features/chat/thread/ChatComposer.tsx")
  const roomComposer = read("features/miniRoom/scene/RoomChatComposer.tsx")
  const avatarLayer = read("features/miniRoom/scene/AvatarLayer.tsx")
  assert.match(screen, /<ChatTypingBubble threadId=\{resolvedThreadId\}/)
  assert.match(screen, /draftTyping=\{draftTyping\}/)
  assert.match(composer, /draftTyping\.noteDraft\(event\.nativeEvent\.text\)/)
  assert.match(composer, /onBlur=\{draftTyping\?\.endDraft\}/)
  assert.match(roomComposer, /draftTyping\?\.noteDraft\(text\)/)
  assert.match(roomComposer, /onBlur=\{draftTyping\?\.endDraft\}/)
  // A spoken line wins over the dots; the chibi art is never replaced.
  assert.match(avatarLayer, /\{typing && !bubble \? <RoomTypingBubble \/> : null\}/)
})

test("typing dots animate on the UI thread and hold still under Reduce Motion", () => {
  const dots = read("ui/typingDots.tsx")
  assert.match(dots, /from "react-native-reanimated"/)
  assert.match(dots, /withRepeat\(/)
  assert.match(dots, /const animate = !useReducedMotion\(\)/)
  assert.match(dots, /if \(!animate\) \{\s*cancelAnimation\(progress\)/)
  assert.doesNotMatch(dots, /useState|requestAnimationFrame|setInterval/)
})

test("typing state is memory only and never logged", () => {
  for (const path of [
    "features/chat/typing/chatTypingStore.ts",
    "features/chat/typing/useChatDraftTyping.ts",
    "features/chat/typing/usePartnerTyping.ts",
    "features/chat/typing/chatTypingModel.ts"
  ]) {
    const source = read(path)
    assert.doesNotMatch(source, /AsyncStorage|console\.|captureException|trackEvent|analytics/i, path)
  }
})
