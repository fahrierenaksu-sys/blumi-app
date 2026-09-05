import assert from "node:assert/strict"
import test from "node:test"
import { createEmptyAccountDataExporter, exportAccountFields } from "./accountDataExporter"
import { createAccountRecord } from "../auth/authStore"

test("account export whitelists public account data and retains real terms acceptance only", async () => {
  const account = createAccountRecord("+905551112233")
  const metadata = { schemaVersion: "2026-07-21" as const, exportedAt: "2026-09-05T00:00:00Z", exclusions: ["secrets"] }
  let json = ""
  for await (const chunk of createEmptyAccountDataExporter().streamExport(account, metadata)) json += chunk
  const payload = JSON.parse(json)
  assert.equal(payload.account.phoneNumber, account.phoneNumber)
  assert.equal(Object.keys(payload.data).length, 11)
  assert.equal(payload.data.inventory, null)
  assert.deepEqual(payload.data.messages, [])
  assert.equal("moderation" in payload.account, false)
  assert.equal("acceptedTerms" in payload.account, false)
  const acceptedTerms = { version: "v1", locale: "tr" as const, acceptedAt: metadata.exportedAt }
  assert.deepEqual(exportAccountFields({ ...account, acceptedTerms }).acceptedTerms, acceptedTerms)
})
