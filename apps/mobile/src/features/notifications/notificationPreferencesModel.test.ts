import assert from "node:assert/strict"
import test from "node:test"
import {
  NOTIFICATION_PREFERENCE_ROWS,
  updateNotificationPreferenceToggle
} from "./notificationPreferencesModel"

test("notification preference toggle updates only the requested value", () => {
  const current = {
    likesEnabled: true,
    messagesEnabled: true,
    matchesEnabled: true,
    discoveryWatchEnabled: true,
    quietHours: null,
    quietHoursUtcOffsetMinutes: 180,
    maxPushesPerHour: 6
  }
  assert.deepEqual(
    updateNotificationPreferenceToggle(current, "matchesEnabled", false),
    { ...current, matchesEnabled: false }
  )
  assert.deepEqual(
    NOTIFICATION_PREFERENCE_ROWS.map((row) => row.key),
    ["likesEnabled", "messagesEnabled", "matchesEnabled", "discoveryWatchEnabled"]
  )
})
