import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_ITEM_RULES,
  BLUMI_R1_RELEASE_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  ECONOMY_CATALOG,
  isAvatarItemRetired,
  isLegacyItemId,
  isReleaseCatalogItemHeld,
  toAvatarLoadoutV2,
  type ReleaseCatalog
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createAvatarService } from "../avatar/avatarService"
import { createConfiguredServerServices, resolveServerConfig } from "../config"
import { createEconomyService } from "./economyService"
import { resolveQaClothingGrant } from "./qaClothingGrant"

// Fictional 555 numbers; they exist only inside the in-memory test server.
const QA_GIRL_PHONE = "+12025550101"
const QA_BOY_PHONE = "+12025550102"
const OTHER_PHONE = "+12025550188"
const TERMS = { version: "test-terms-v1", locale: "tr" } as const
// Every wearable new-collection piece is receipted now, so the R1 catalog holds no clothing a grant could hand out.
// The grant's rule still has to hold for the next held piece: a test release catalog holds one real piece again.
const HELD_GIRL_SHOES = "shoes_girl_camel_ankle_boots"
const FIXTURE_RELEASE_CATALOG: ReleaseCatalog = {
  ...BLUMI_R1_RELEASE_CATALOG,
  heldScopes: [
    ...BLUMI_R1_RELEASE_CATALOG.heldScopes,
    { scope: "test-held-clothing-fixture", productionPublication: false, itemIdPatterns: [`^${HELD_GIRL_SHOES}$`] }
  ]
}

const LOCAL_QA_ENV = {
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  BLUMI_AUTH_REPOSITORY: "memory",
  BLUMI_QA_AUTH_ENABLED: "1",
  BLUMI_QA_PHONE_NUMBER: `${QA_GIRL_PHONE},${QA_BOY_PHONE}`,
  BLUMI_QA_OTP_CODE: "135790"
}

/** The config.ts wiring of a local memory server, with the fixture release catalog in place of the R1 one. */
function createFixtureServices(qaAuth: Readonly<{ phoneNumbers: readonly string[] }> | undefined) {
  const authService = createAuthService()
  const qaClothingGrant = resolveQaClothingGrant({
    qaAuth,
    nodeEnv: "development",
    authRepositoryMode: "memory",
    authRepository: authService.repository,
    releaseCatalog: FIXTURE_RELEASE_CATALOG
  })
  const economyService = createEconomyService({
    qaOwnedAvatarItemIdsFor: qaClothingGrant,
    releaseCatalog: FIXTURE_RELEASE_CATALOG
  })
  const avatarService = createAvatarService({ authService, economyService })
  return { authService, economyService, avatarService }
}

async function saveHeldShoes(services: Pick<ReturnType<typeof createFixtureServices>, "authService" | "avatarService">, phoneNumber: string) {
  const { account, sessionToken } = await services.authService.signInWithVerifiedPhone(phoneNumber, { acceptedTerms: TERMS })
  const loadout = { ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT), shoesId: HELD_GIRL_SHOES }
  return services.avatarService.saveAvatar(sessionToken, {
    loadout,
    revision: account.profile.avatar.revision,
    allowV2Write: true
  })
}

test("the fixture piece is a real, wearable clothing item held only by the fixture release catalog", () => {
  const item = ECONOMY_CATALOG.find((entry) => entry.itemId === HELD_GIRL_SHOES)
  assert.equal(item?.type, "avatar")
  assert.equal(isLegacyItemId(HELD_GIRL_SHOES), false)
  assert.equal(isAvatarItemRetired(AVATAR_ITEM_RULES, HELD_GIRL_SHOES), false)
  assert.equal(isReleaseCatalogItemHeld(HELD_GIRL_SHOES, FIXTURE_RELEASE_CATALOG), true)
})

test("with the R1 catalog the grant hands a QA account only held, non-legacy, non-retired clothing", async () => {
  const config = resolveServerConfig(LOCAL_QA_ENV)
  assert.ok(config.qaAuth)
  const authService = createAuthService()
  const grant = resolveQaClothingGrant({
    qaAuth: config.qaAuth,
    nodeEnv: "development",
    authRepositoryMode: "memory",
    authRepository: authService.repository
  })
  assert.ok(grant)
  const { account } = await authService.signInWithVerifiedPhone(QA_GIRL_PHONE, { acceptedTerms: TERMS })
  const granted = await grant(account.userId)
  for (const itemId of granted) {
    assert.equal(isReleaseCatalogItemHeld(itemId), true, itemId)
    assert.equal(isLegacyItemId(itemId), false, itemId)
    assert.equal(isAvatarItemRetired(AVATAR_ITEM_RULES, itemId), false, itemId)
  }
})

test("a local QA account on the memory server can wear and save a held clothing item, but still cannot buy one", async () => {
  const services = createFixtureServices({ phoneNumbers: [QA_GIRL_PHONE, QA_BOY_PHONE] })
  const saved = await saveHeldShoes(services, QA_GIRL_PHONE)
  assert.equal(saved.kind, "updated", JSON.stringify(saved))
  assert.equal(saved.kind === "updated" && saved.selection.loadout.shoesId, HELD_GIRL_SHOES)
  const { account } = await services.authService.signInWithVerifiedPhone(QA_BOY_PHONE, { acceptedTerms: TERMS })
  await assert.rejects(
    () => services.economyService.purchaseItem(account.userId, { type: "avatar", itemId: HELD_GIRL_SHOES, avatarBodyId: "avatar_v2_body_default" }),
    /not available/i
  )
})

test("an account that is not a listed QA number cannot save a held clothing item on the same QA server", async () => {
  const services = createFixtureServices({ phoneNumbers: [QA_GIRL_PHONE, QA_BOY_PHONE] })
  const saved = await saveHeldShoes(services, OTHER_PHONE)
  assert.equal(saved.kind, "invalid", JSON.stringify(saved))
  const { account } = await services.authService.signInWithVerifiedPhone(OTHER_PHONE, { acceptedTerms: TERMS })
  const inventory = await services.economyService.getInventory(account.userId)
  assert.equal(inventory.ownedAvatarItemIds.some((itemId) => isReleaseCatalogItemHeld(itemId, FIXTURE_RELEASE_CATALOG)), false)
})

test("without local QA auth even a QA number cannot save a held clothing item", async () => {
  assert.equal(resolveServerConfig({ NODE_ENV: "development" }).qaAuth, undefined)
  const services = createFixtureServices(undefined)
  const saved = await saveHeldShoes(services, QA_GIRL_PHONE)
  assert.equal(saved.kind, "invalid", JSON.stringify(saved))
  const configured = createConfiguredServerServices(resolveServerConfig({ NODE_ENV: "development" }))
  try {
    const { account } = await configured.authService.signInWithVerifiedPhone(QA_GIRL_PHONE, { acceptedTerms: TERMS })
    const inventory = await configured.economyService.getInventory(account.userId)
    assert.equal(inventory.ownedAvatarItemIds.some((itemId) => isReleaseCatalogItemHeld(itemId)), false)
  } finally {
    await configured.close()
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
