import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as HookModule from "./useMiniRoomChatEmotes"
import { CHAT_EMOTE_SENDER_COOLDOWN_MS } from "./chatEmoteMapper"
import { MINI_ROOM_EMOTE_LIFETIME_MS } from "./miniRoomEmoteModel"

function mount(options: { flag: boolean; enabled?: boolean }) {
  const runtime = createFakeReactRuntime()
  const clock = { now: 10_000 }
  const timers = new Map<number, { run: () => void; at: number }>()
  let timerId = 0
  const { useMiniRoomChatEmotes } = loadSourceWithFakeReact<typeof HookModule>(
    "features/miniRoom/emotes/useMiniRoomChatEmotes.ts",
    runtime,
    {
      modules: { "../../../config/env": { IS_BLUMI_CHAT_EMOTES_ENABLED: options.flag } },
      real: ["./chatEmoteMapper", "./miniRoomEmoteModel"],
      globals: {
        setTimeout: (run: () => void, delay: number) => {
          timerId += 1
          timers.set(timerId, { run, at: clock.now + delay })
          return timerId
        },
        clearTimeout: (id: number) => { timers.delete(id) },
        Date: { now: () => clock.now }
      }
    }
  )
  const played: string[] = []
  let result: HookModule.MiniRoomChatEmotes | undefined
  runtime.render(() => {
    result = useMiniRoomChatEmotes({
      enabled: options.enabled,
      onEmote: (speakerUserId, emote) => { played.push(`${speakerUserId}:${emote}`) }
    })
    return result
  })
  return {
    played,
    timers,
    get emotes() { return result!.emotes },
    note(senderUserId: string, body: string, sentAtMs?: number) { result!.noteChatMessage({ senderUserId, body, sentAtMs }) },
    advance(ms: number) {
      clock.now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at > clock.now) continue
        timers.delete(id)
        timer.run()
      }
    },
    unmount() { runtime.unmount() }
  }
}

test("an emote shows over its sender for its lifetime and then leaves on one timer", () => {
  const room = mount({ flag: true })
  room.note("partner", "selam 👋")
  assert.equal(room.emotes.partner?.emote, "wave")
  assert.deepEqual(room.played, ["partner:wave"])
  assert.equal(room.timers.size, 1)
  room.advance(MINI_ROOM_EMOTE_LIFETIME_MS - 1)
  assert.equal(room.emotes.partner?.emote, "wave")
  room.advance(1)
  assert.deepEqual(room.emotes, {})
  assert.equal(room.timers.size, 0)
})

test("a burst from one sender reacts once per cooldown; the other person still reacts", () => {
  const room = mount({ flag: true })
  room.note("partner", "hahaha")
  room.note("partner", "❤️")
  room.note("local", "❤️")
  assert.deepEqual(room.played, ["partner:laugh", "local:heart"])
  room.advance(CHAT_EMOTE_SENDER_COOLDOWN_MS)
  room.note("partner", "❤️")
  assert.equal(room.emotes.partner?.emote, "heart")
  assert.deepEqual(room.played, ["partner:laugh", "local:heart", "partner:heart"])
})

test("with the flag off nothing is read, shown or timed", () => {
  const room = mount({ flag: false })
  room.note("partner", "selam")
  assert.deepEqual(room.emotes, {})
  assert.deepEqual(room.played, [])
  assert.equal(room.timers.size, 0)
})

test("long lines and late deliveries never emote", () => {
  const room = mount({ flag: true })
  room.note("partner", `selam ${"uzun bir mesaj ".repeat(8)}`)
  room.note("partner", "selam", 10_000 - 60_000)
  assert.deepEqual(room.emotes, {})
  assert.deepEqual(room.played, [])
})

test("the emotes on screen hold only an emote name and timing, never the line", () => {
  const room = mount({ flag: true, enabled: true })
  room.note("partner", "iyi geceler gizli plan")
  const serialised = JSON.stringify(room.emotes)
  assert.equal(room.emotes.partner?.emote, "sleepy")
  for (const fragment of ["geceler", "gizli", "plan"]) assert.equal(serialised.includes(fragment), false)
  room.unmount()
  assert.equal(room.timers.size, 0)
})
