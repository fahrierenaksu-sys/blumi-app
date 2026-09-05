import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationTimeZoneSync } from "./notificationTimeZoneSync"

test("foreground sync sends only changed timezone, preserving notification choices", async () => {
  let zone = "Europe/Berlin"
  const patches: unknown[] = []
  const sync = createNotificationTimeZoneSync({ currentTimeZone: () => zone,
    update: async (patch) => { patches.push(patch) } })
  await sync()
  await sync()
  zone = "America/New_York"
  await sync()
  assert.deepEqual(patches, [{ quietHoursTimeZone: "Europe/Berlin" }, { quietHoursTimeZone: "America/New_York" }])
})
