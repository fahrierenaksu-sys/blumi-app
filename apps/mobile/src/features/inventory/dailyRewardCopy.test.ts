import assert from "node:assert/strict"
import test from "node:test"
import { getDailyRewardToastCopy } from "./dailyRewardCopy"

test("the daily reward toast is translated and names the reward amount", () => {
  const rewardCoins = 25
  for (const onboardingCompleted of [true, false]) {
    const turkish = getDailyRewardToastCopy("tr", rewardCoins, onboardingCompleted)
    const english = getDailyRewardToastCopy("en", rewardCoins, onboardingCompleted)
    assert.notEqual(turkish.title, english.title)
    assert.notEqual(turkish.body, english.body)
    assert.ok(turkish.title.includes(String(rewardCoins)))
    assert.ok(english.title.includes(String(rewardCoins)))
  }
})

test("the first reward after onboarding has its own message", () => {
  for (const locale of ["tr", "en"] as const) {
    assert.notEqual(
      getDailyRewardToastCopy(locale, 25, true).body,
      getDailyRewardToastCopy(locale, 25, false).body
    )
  }
})
