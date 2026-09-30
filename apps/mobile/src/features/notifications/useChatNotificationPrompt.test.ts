import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useChatNotificationPrompt"

test("the first focused production chat offers the explanation once per account", async () => {
  const runtime = createFakeReactRuntime()
  const saved = new Map<string, string>()
  const storage = { getItem: async (key: string) => saved.get(key) ?? null,
    setItem: async (key: string, value: string) => { saved.set(key, value) } }
  const { useChatNotificationPrompt } = loadSourceWithFakeReact<typeof Hook>(
    "features/notifications/useChatNotificationPrompt.ts", runtime, {
      modules: { "@react-native-async-storage/async-storage": storage }
    })
  let input = { userId: "a", mode: "production" as "production" | "demo", isFocused: false,
    permissionStatus: "undetermined" as "undetermined" | "granted" }
  const render = () => runtime.render(() => useChatNotificationPrompt(input))
  render()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((runtime.output as ReturnType<typeof Hook.useChatNotificationPrompt>).visible, false)
  input = { ...input, isFocused: true }
  render()
  await new Promise((resolve) => setImmediate(resolve))
  const prompt = runtime.output as ReturnType<typeof Hook.useChatNotificationPrompt>
  assert.equal(prompt.visible, true)
  prompt.dismiss()
  assert.equal((runtime.output as typeof prompt).visible, false)
  input = { ...input, isFocused: false }; render()
  input = { ...input, isFocused: true }; render()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((runtime.output as typeof prompt).visible, false)
  input = { ...input, userId: "b" }; render()
  assert.equal((runtime.output as typeof prompt).visible, false, "previous account cannot flash its prompt")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((runtime.output as typeof prompt).visible, true)
  input = { ...input, permissionStatus: "granted" }; render()
  assert.equal((runtime.output as typeof prompt).visible, false)
  runtime.unmount()
})

test("a pending storage read cannot show the prompt after blur or account change", async () => {
  const runtime = createFakeReactRuntime()
  let finish!: (value: string | null) => void
  let writes = 0
  const { useChatNotificationPrompt } = loadSourceWithFakeReact<typeof Hook>(
    "features/notifications/useChatNotificationPrompt.ts", runtime, { modules: {
      "@react-native-async-storage/async-storage": {
        getItem: () => new Promise((resolve) => { finish = resolve }),
        setItem: async () => { writes++ }
      }
    } })
  let focused = true
  const render = () => runtime.render(() => useChatNotificationPrompt({ userId: "a", mode: "production",
    isFocused: focused, permissionStatus: "undetermined" }))
  render()
  focused = false; render()
  finish(null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((runtime.output as ReturnType<typeof Hook.useChatNotificationPrompt>).visible, false)
  assert.equal(writes, 0)
  runtime.unmount()
})
