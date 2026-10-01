import assert from "node:assert/strict"
import test from "node:test"
import { getDailyRewardToastCopy } from "./dailyRewardCopy"

test("the daily reward toast speaks Turkish on Turkish devices", () => {
  assert.deepEqual(getDailyRewardToastCopy("tr", 25, true), {
    title: "Günlük ödül: +25 coin",
    body: "Bir sonraki vibe’ın için küçük bir hediye."
  })
  assert.equal(getDailyRewardToastCopy("tr", 25, false).body, "İlk vibe’ın biraz ekstrayla başlıyor.")
})

test("English keeps the existing reward wording", () => {
  assert.deepEqual(getDailyRewardToastCopy("en", 25, true), {
    title: "Daily reward: +25 coins",
    body: "A little something for your next vibe."
  })
  assert.equal(getDailyRewardToastCopy("en", 10, false).body, "Your first vibe starts with a little extra.")
})
