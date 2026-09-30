import assert from "node:assert/strict"
import test from "node:test"
import { runInboxPullRefresh } from "./inboxPullRefreshModel"

function harness(refresh: () => Promise<void>) {
  const events: string[] = []
  const run = runInboxPullRefresh({
    refresh: () => {
      events.push("refresh")
      return refresh()
    },
    onFeedback: () => events.push("haptic"),
    setRefreshing: (refreshing) => events.push(`refreshing:${refreshing}`)
  })
  return { events, run }
}

test("pull-to-refresh gives feedback, shows the spinner and hides it once the request settles", async () => {
  let resolve: () => void = () => undefined
  const { events, run } = harness(() => new Promise<void>((done) => { resolve = done }))

  assert.deepEqual(events, ["haptic", "refreshing:true", "refresh"])
  resolve()
  await run
  assert.deepEqual(events, ["haptic", "refreshing:true", "refresh", "refreshing:false"])
})

test("a failed refresh still hides the spinner and does not reject the gesture", async () => {
  const { events, run } = harness(() => Promise.reject(new Error("offline")))

  await assert.doesNotReject(run)
  assert.deepEqual(events, ["haptic", "refreshing:true", "refresh", "refreshing:false"])
})
