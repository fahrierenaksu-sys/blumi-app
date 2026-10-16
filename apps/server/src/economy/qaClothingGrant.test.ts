import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  isReleaseCatalogItemHeld,
  toAvatarLoadoutV2
} from "@blumi/domain"
import { createConfiguredServerServices, resolveServerConfig } from "../config"
import { resolveQaClothingGrant } from "./qaClothingGrant"

// Fictional 555 numbers; they exist only inside the in-memory test server.
const QA_GIRL_PHONE = "+12025550101"
const QA_BOY_PHONE = "+12025550102"
const OTHER_PHONE = "+12025550188"
const TERMS = { version: "test-terms-v1", locale: "tr" } as const
// a landed new-collection piece the release catalog still holds until its receipt
const HELD_GIRL_SHOES = "shoes_girl_camel_ankle_boots"

const LOCAL_QA_ENV = {
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  BLUMI_AUTH_REPOSITORY: "memory",
  BLUMI_QA_AUTH_ENABLED: "1",
  BLUMI_QA_PHONE_NUMBER: `${QA_GIRL_PHONE},${QA_BOY_PHONE}`,
  BLUMI_QA_OTP_CODE: "135790"
}

async function saveHeldShoes(services: ReturnType<typeof createConfiguredServerServices>, phoneNumber: string) {
  const { account, sessionToken } = await services.authService.signInWithVerifiedPhone(phoneNumber, { acceptedTerms: TERMS })
  const loadout = { ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT), shoesId: HELD_GIRL_SHOES }
  return services.avatarService.saveAvatar(sessionToken, {
    loadout,
    revision: account.profile.avatar.revision,
    allowV2Write: true
  })
}

test("the fixture piece is a held clothing item", () => {
  assert.equal(isReleaseCatalogItemHeld(HELD_GIRL_SHOES), true)
})

test("a local QA account on the memory server can wear and save a held clothing item, but still cannot buy one", async () => {
  const services = createConfiguredServerServices(resolveServerConfig(LOCAL_QA_ENV))
  try {
    const saved = await saveHeldShoes(services, QA_GIRL_PHONE)
    assert.equal(saved.kind, "updated", JSON.stringify(saved))
    assert.equal(saved.kind === "updated" && saved.selection.loadout.shoesId, HELD_GIRL_SHOES)
    const { account } = await services.authService.signInWithVerifiedPhone(QA_BOY_PHONE, { acceptedTerms: TERMS })
    await assert.rejects(
      () => services.economyService.purchaseItem(account.userId, { type: "avatar", itemId: "top_girl_breton_stripe", avatarBodyId: "avatar_v2_body_default" }),
      /not available/i
    )
  } finally {
    await services.close()
  }
})

test("an account that is not a listed QA number cannot save a held clothing item on the same QA server", async () => {
  const services = createConfiguredServerServices(resolveServerConfig(LOCAL_QA_ENV))
  try {
    const saved = await saveHeldShoes(services, OTHER_PHONE)
    assert.equal(saved.kind, "invalid", JSON.stringify(saved))
    const { account } = await services.authService.signInWithVerifiedPhone(OTHER_PHONE, { acceptedTerms: TERMS })
    const inventory = await services.economyService.getInventory(account.userId)
    assert.equal(inventory.ownedAvatarItemIds.some((itemId) => isReleaseCatalogItemHeld(itemId)), false)
  } finally {
    await services.close()
  }
})

test("without local QA auth even a QA number cannot save a held clothing item", async () => {
  const services = createConfiguredServerServices(resolveServerConfig({ NODE_ENV: "development" }))
  try {
    const saved = await saveHeldShoes(services, QA_GIRL_PHONE)
    assert.equal(saved.kind, "invalid", JSON.stringify(saved))
  } finally {
    await services.close()
  }
})

test("production and database configs refuse the QA clothing grant", () => {
  assert.throws(() => resolveServerConfig({ ...LOCAL_QA_ENV, NODE_ENV: "production" }), /QA auth must never be configured in production/)
  const findAccountByUserId = async () => null
  const qaAuth = { phoneNumbers: [QA_GIRL_PHONE], verificationCode: "135790" }
  for (const [nodeEnv, authRepositoryMode] of [["production", "memory"], ["test", "memory"], ["development", "postgres"]] as const) {
    assert.throws(
      () => resolveQaClothingGrant({ qaAuth, nodeEnv, authRepositoryMode, authRepository: { findAccountByUserId } }),
      /QA clothing grant/,
      `${nodeEnv} ${authRepositoryMode}`
    )
  }
  assert.equal(
    resolveQaClothingGrant({ qaAuth: undefined, nodeEnv: "production", authRepositoryMode: "postgres", authRepository: { findAccountByUserId } }),
    undefined
  )
})
