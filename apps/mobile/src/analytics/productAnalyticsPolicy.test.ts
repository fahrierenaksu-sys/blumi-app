import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeProductEventProperties, sanitizeNamedProductEventProperties } from "./productAnalyticsPolicy"

test("event allowlists reject unknown dimensions, free text and nonfinite metrics", () => {
  assert.deepEqual(sanitizeNamedProductEventProperties("chat_message_sent", {
    mode: "production", kind: "text", secret: "private", stage: "someone@example.test"
  }), { mode: "production", kind: "text" })
  assert.deepEqual(sanitizeNamedProductEventProperties("purchase_completed", {
    price_coins: Infinity, item_type: "private text", unexpected: "x"
  }), {})
  assert.deepEqual(sanitizeNamedProductEventProperties("unknown", { mode: "production" }), {})
  assert.deepEqual(sanitizeNamedProductEventProperties("onboarding_intro_performance", {
    elapsed_ms: NaN, intro_frame_samples: 100, cold_start_ms: -1,
    flow: "x".repeat(500), reduce_motion: false
  }), { intro_frame_samples: 100, reduce_motion: false })
})

test("analytics retains compact funnel dimensions but excludes identifiers and user content", () => {
  assert.deepEqual(
    sanitizeProductEventProperties({
      funnel_stage: "match_to_first_message",
      mode: "production",
      count: 1,
      user_id: "user_123",
      userId: "user_123",
      referral_code: "r_secret",
      url: "blumi://r/r_secret",
      message_body: "private text",
      display_name: "Lina",
      displayName: "Lina"
    }),
    {
      funnel_stage: "match_to_first_message",
      mode: "production",
      count: 1
    }
  )
})

test("analytics accepts only scalar properties and keeps the bounded property budget", () => {
  assert.deepEqual(
    sanitizeProductEventProperties({
      first: "a",
      second: 2,
      third: true,
      nested: { not: "allowed" },
      list: ["not", "allowed"],
      omitted: undefined
    }),
    { first: "a", second: 2, third: true }
  )
})

test("intro analytics can keep timing and frame metrics while still rejecting identity-like keys", () => {
  assert.deepEqual(
    sanitizeProductEventProperties({
      beat: "brand_reveal",
      flow: "auth_entry",
      reduce_motion: false,
      resumed: true,
      cold_start_ms: 842,
      js_mount_ms: 176,
      intro_visible_ms: 666,
      intro_frame_samples: 131,
      intro_slow_frames: 4,
      intro_severe_frames: 1,
      intro_worst_frame_ms: 26,
      intro_average_frame_ms: 17,
      user_id: "u_123",
      displayName: "Evren",
      verification_code: "112233"
    }),
    {
      beat: "brand_reveal",
      flow: "auth_entry",
      reduce_motion: false,
      resumed: true,
      cold_start_ms: 842,
      js_mount_ms: 176,
      intro_visible_ms: 666,
      intro_frame_samples: 131,
      intro_slow_frames: 4,
      intro_severe_frames: 1,
      intro_worst_frame_ms: 26,
      intro_average_frame_ms: 17
    }
  )
})

test("wardrobe producer categories survive the named-event privacy boundary", () => {
  for (const itemType of ["face", "eyes", "nose", "mouth"] as const) {
    assert.deepEqual(
      sanitizeNamedProductEventProperties("wardrobe_item_equipped", {
        item_type: itemType,
        full_look: false
      }),
      { item_type: itemType, full_look: false }
    )
  }
})
