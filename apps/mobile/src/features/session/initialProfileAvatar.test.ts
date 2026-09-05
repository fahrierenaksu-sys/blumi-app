import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import { userAvatarToLoadout } from "../avatarV2/avatarSelectionModel"
import type { SessionActor } from "./sessionModel"
import { persistUntouchedProfileStarterAvatar } from "./initialProfileAvatar"

const femaleAvatar: UserAvatar = {
  bodyId: "female-body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "hair",
  topId: "top",
  bottomId: "bottom",
  shoesId: "shoes",
  accessoryIds: []
}

const maleAvatar: UserAvatar = {
  ...femaleAvatar,
  bodyId: "avatar_v2_body_male_light"
}

const catalog = [
  { id: "female-body", type: "body" },
  { id: "avatar_v2_body_male_light", type: "body" }
] as AvatarCatalogItem[]

test("first profile completion preserves the current body for AvatarSetup", async () => {
  const actor = createActor(0)
  const calls: { revision: number; avatar: UserAvatar }[] = []
  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async ({ avatar, revision }) => {
      calls.push({ avatar, revision })
      return {
        kind: "updated",
        selection: createSelection(avatar, revision + 1)
      }
    }
  })

  assert.equal(calls.length, 0)
  assert.equal(next.profile.avatar.loadout?.bodyId, "female-body")
  assert.equal(next.profile.avatar.revision, 0)
  assert.equal(actor.profile.avatar.loadout?.bodyId, "female-body")
})

test("server-created default is not remapped from profile identity", async () => {
  const actor = createActor(1)
  const calls: { revision: number; avatar: UserAvatar }[] = []
  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async ({ avatar, revision }) => {
      calls.push({ avatar, revision })
      return {
        kind: "updated",
        selection: createSelection(avatar, revision + 1)
      }
    }
  })

  assert.equal(calls.length, 0)
  assert.equal(next.profile.avatar.loadout?.bodyId, "female-body")
})

test("returning from character setup does not switch body from profile identity", async () => {
  const actor = createActor(7)
  const calls: { revision: number; avatar: UserAvatar }[] = []
  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async ({ avatar, revision }) => {
      calls.push({ avatar, revision })
      return {
        kind: "updated",
        selection: createSelection(avatar, revision + 1)
      }
    }
  })

  assert.equal(calls.length, 0)
  assert.equal(next.profile.avatar.loadout?.bodyId, "female-body")
})

test("profile identity never changes the chosen avatar body", async () => {
  const actor = createActor(7)
  let serverWrites = 0

  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async () => {
      serverWrites += 1
      return {
        kind: "updated",
        selection: createSelection(maleAvatar, 8)
      }
    }
  })

  assert.equal(serverWrites, 0)
  assert.equal(next.profile.gender, "man")
  assert.equal(next.profile.avatar.loadout?.bodyId, "female-body")
  assert.equal(next, actor)
})

test("a customized revision-one avatar is never mistaken for a starter", async () => {
  const customized = { ...femaleAvatar, hairId: "custom-hair" }
  const actor = createActor(1, customized)
  let calls = 0
  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async () => {
      calls += 1
      return {
        kind: "updated",
        selection: createSelection(maleAvatar, 2)
      }
    }
  })

  assert.equal(calls, 0)
  assert.equal(next.profile.avatar.loadout?.hairId, "custom-hair")
})

test("profile completion never enters avatar CAS", async () => {
  const newerCanonical = createSelection(femaleAvatar, 4)
  let calls = 0
  const next = await persistUntouchedProfileStarterAvatar(createActor(0), {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async () => {
      calls += 1
      return { kind: "conflict", current: newerCanonical }
    }
  })

  assert.equal(calls, 0)
  assert.equal(next.profile.avatar.revision, 0)
  assert.equal(next.profile.avatar.loadout?.bodyId, "female-body")
})

test("customized avatars stay untouched across profile review and newer revisions", async () => {
  let calls = 0
  const dependencies = {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async () => {
      calls += 1
      return {
        kind: "updated" as const,
        selection: createSelection(maleAvatar, 1)
      }
    }
  }

  const customizedAvatar = { ...femaleAvatar, hairId: "custom-hair" }
  const reviewActor = createActor(0, customizedAvatar)
  const reviewed = await persistUntouchedProfileStarterAvatar(
    reviewActor,
    dependencies
  )
  const newerActor = createActor(3, customizedAvatar)
  const preserved = await persistUntouchedProfileStarterAvatar(
    newerActor,
    dependencies
  )

  assert.equal(calls, 0)
  assert.equal(reviewed, reviewActor)
  assert.equal(preserved, newerActor)
})

test("demo and legacy onboarding leave body choice to AvatarSetup", async () => {
  const baseActor = createActor(0)
  const actor: SessionActor = {
    ...baseActor,
    session: { ...baseActor.session, mode: "demo" },
    profile: {
      ...baseActor.profile,
      avatar: { presetId: "female-body" }
    }
  }
  let serverWrites = 0

  const next = await persistUntouchedProfileStarterAvatar(actor, {
    catalog,
    fallbackAvatar: femaleAvatar,
    saveProductionAvatar: async () => {
      serverWrites += 1
      return {
        kind: "updated",
        selection: createSelection(maleAvatar, 1)
      }
    }
  })

  assert.equal(serverWrites, 0)
  assert.equal(next.profile.avatar.presetId, "female-body")
  assert.equal(next.profile.avatar.loadout, undefined)
})

function createActor(
  revision: number,
  avatar: UserAvatar = femaleAvatar
): SessionActor {
  return {
    session: {
      accountId: "account-one",
      sessionId: "session-one",
      mode: "production",
      onboarding: {
        profile: "incomplete",
        avatar: "incomplete",
        room: "incomplete"
      },
      userId: "user-one",
      sessionToken: "token-one",
      expiresAt: "2099-01-01T00:00:00.000Z"
    },
    profile: {
      userId: "user-one",
      displayName: "Alex",
      age: 24,
      gender: "man",
      avatar: createSelection(avatar, revision)
    }
  }
}

function createSelection(
  avatar: UserAvatar,
  revision: number
): CompleteAvatarSelection {
  return {
    presetId: avatar.bodyId,
    revision,
    loadout: userAvatarToLoadout(avatar)
  }
}
