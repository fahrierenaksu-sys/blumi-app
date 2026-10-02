import assert from "node:assert/strict"
import test from "node:test"
import { NOTIFICATION_PREFERENCE_ROWS } from "../notifications/notificationPreferencesModel"
import { getSettingsCopy } from "./settingsCopy"

test("every notification preference row is written in both release languages", () => {
  for (const { key } of NOTIFICATION_PREFERENCE_ROWS) {
    const en = getSettingsCopy("en").notificationRows[key]
    const tr = getSettingsCopy("tr").notificationRows[key]
    assert.ok(en.label && en.description && tr.label && tr.description, key)
    assert.notEqual(tr.label, en.label, `${key} is translated`)
  }
})
