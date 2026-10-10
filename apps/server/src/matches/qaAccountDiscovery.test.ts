import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"
import { createMatchService } from "./matchService"
import { createQaAccountDiscoveryRepository } from "./qaAccountDiscovery"

// Fictional 555 numbers; they exist only inside this in-memory test.
const GIRL = "+12025550101"
const BOY = "+12025550102"
const STRANGER = "+12025550199"
const FILTERS = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }

function account(userId: string, phoneNumber: string, gender: "woman" | "man") {
  const loadout = gender === "man" ? DEFAULT_MALE_AVATAR_LOADOUT : DEFAULT_FEMALE_AVATAR_LOADOUT
  return {
    userId,
    phoneNumber,
    profile: { userId, displayName: userId, age: 24, gender, avatar: { presetId: loadout.bodyId, loadout, revision: 0 } }
  }
}

function createFixture() {
  const accounts = new Map([
    ["girl", account("girl", GIRL, "woman")],
    ["boy", account("boy", BOY, "man")],
    ["stranger", account("stranger", STRANGER, "woman")]
  ])
  const repository = createQaAccountDiscoveryRepository({
    authRepository: { async findAccountByUserId(userId: string) { return (accounts.get(userId) ?? null) as never } },
    qaPhoneNumbers: [GIRL, BOY]
  })
  return { repository, matchService: createMatchService({ repository }) }
}

test("two QA accounts can like each other into a match on the memory server", async () => {
  const { matchService } = createFixture()
  const first = await matchService.decideEligible("girl", "boy", "like", FILTERS, "woman")
  assert.equal(first.match, null)
  const second = await matchService.decideEligible("boy", "girl", "like", FILTERS, "man")
  assert.ok(second.match, "the second like completes the match")
})

test("an account outside the QA list is never published to Discover", async () => {
  const { repository } = createFixture()
  assert.equal(await repository.findDiscoverProfile("stranger"), null)
  assert.equal(await repository.findDiscoverProfile("missing"), null)
  assert.ok(await repository.findDiscoverProfile("boy"))
})
