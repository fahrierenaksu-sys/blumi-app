import assert from "node:assert/strict"
import test from "node:test"
import {
  completeSessionSetupStep,
  createDemoSessionActor,
  normalizeStoredSessionActor,
  normalizeSessionActor,
  replaceSessionActorOnboarding,
  shouldApplyProductionAccountSync
} from "./sessionModel"

const COMPLETE_AVATAR = {
  presetId: "avatar_v2_body_default",
  revision: 2,
  loadout: {
    schemaVersion: 1 as const,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: []
  }
}

test("stored production sessions canonicalize complete V1 avatar selections to V2", () => {
  const normalized = normalizeStoredSessionActor({
    session: {
      accountId: "account-1",
      sessionId: "session-1",
      mode: "production",
      userId: "user-1",
      sessionToken: "token-1",
      expiresAt: "2999-01-01T00:00:00.000Z"
    },
    profile: {
      userId: "user-1",
      displayName: "Defne",
      avatar: COMPLETE_AVATAR
    }
  })
  assert.deepEqual(normalized?.profile.avatar, {
    ...COMPLETE_AVATAR,
    loadout: {
      ...COMPLETE_AVATAR.loadout,
      schemaVersion: 2,
      dressId: null,
      outerwearId: null
    }
  })
  assert.notEqual(
    normalized?.profile.avatar.loadout?.accessoryIds,
    COMPLETE_AVATAR.loadout.accessoryIds
  )
})

test("demo session is explicit and already setup for exploration", () => {
  const actor = createDemoSessionActor({
    displayName: "Demo Vibe",
    age: 24,
    avatarPresetId: "sunset"
  })

  assert.equal(actor.session.mode, "demo")
  assert.equal(actor.session.onboarding.profile, "complete")
  assert.equal(actor.session.onboarding.avatar, "complete")
  assert.equal(actor.session.onboarding.room, "complete")
})

test("setup completion is immutable and advances one step", () => {
  const actor = normalizeStoredSessionActor({
    session: {
      userId: "user-1",
      sessionToken: "production-token",
      expiresAt: "2999-01-01T00:00:00.000Z",
      accountId: "account-1",
      sessionId: "session-1",
      mode: "production",
      onboarding: {
        profile: "incomplete",
        avatar: "incomplete",
        room: "incomplete"
      }
    },
    profile: {
      userId: "user-1",
      displayName: "",
      avatar: { presetId: "dusk" }
    }
  })

  assert.ok(actor)
  const updated = completeSessionSetupStep(actor, "profile")

  assert.notEqual(updated, actor)
  assert.notEqual(updated.session, actor.session)
  assert.equal(actor.session.onboarding.profile, "incomplete")
  assert.equal(updated.session.onboarding.profile, "complete")
  assert.equal(updated.session.onboarding.avatar, "incomplete")
})

test("production onboarding response replaces status without losing the actor", () => {
  const actor = normalizeStoredSessionActor({
    session: {
      userId: "user-1",
      sessionToken: "production-token",
      expiresAt: "2999-01-01T00:00:00.000Z",
      accountId: "account-1",
      sessionId: "session-1",
      mode: "production",
      onboarding: {
        profile: "complete",
        avatar: "complete",
        room: "incomplete"
      }
    },
    profile: {
      userId: "user-1",
      displayName: "QA",
      avatar: COMPLETE_AVATAR
    }
  })
  assert.ok(actor)

  const updated = replaceSessionActorOnboarding(actor, {
    profile: "complete",
    avatar: "complete",
    room: "complete",
    completedAt: "2026-08-11T18:00:00.000Z"
  })

  assert.notEqual(updated, actor)
  assert.notEqual(updated.session, actor.session)
  assert.deepEqual(updated.session.onboarding, {
    profile: "complete",
    avatar: "complete",
    room: "complete",
    completedAt: "2026-08-11T18:00:00.000Z"
  })
  assert.equal(updated.session.mode, "production")
  assert.deepEqual(updated.profile, actor.profile)
})

test("legacy stored sessions normalize without losing returning users", () => {
  const actor = normalizeStoredSessionActor({
    session: {
      userId: "legacy-user",
      sessionToken: "legacy-token",
      expiresAt: "2999-01-01T00:00:00.000Z"
    },
    profile: {
      userId: "legacy-user",
      displayName: "Ece",
      age: 24,
      avatar: { presetId: "sunset" }
    }
  })

  assert.ok(actor)
  assert.equal(actor.session.mode, "production")
  assert.equal(actor.session.accountId, "legacy-user")
  assert.equal(actor.session.onboarding.profile, "complete")
  assert.equal(actor.session.onboarding.avatar, "complete")
  assert.equal(actor.session.onboarding.room, "complete")
})

test("stored session mode cannot downgrade a production token into a demo actor", () => {
  const actor = normalizeStoredSessionActor({
    session: {
      accountId: "account-1",
      sessionId: "session-1",
      mode: "demo",
      userId: "user-1",
      sessionToken: "production-token",
      expiresAt: "2999-01-01T00:00:00.000Z"
    },
    profile: {
      userId: "user-1",
      displayName: "Defne",
      avatar: { presetId: "sunset" }
    }
  })

  assert.equal(actor, null)
})

test("stored sessions quarantine malformed and unknown profile prompts", () => {
  const normalized = normalizeSessionActor({
    session: {
      accountId: "account-1",
      sessionId: "session-1",
      userId: "user-1",
      sessionToken: "token-1",
      expiresAt: "2026-08-01T00:00:00.000Z",
      mode: "production",
      onboarding: { profile: "complete", avatar: "complete", room: "complete" }
    },
    profile: {
      userId: "user-1",
      displayName: "Defne",
      prompts: [
        { promptId: "invented", answer: "Must not leak." },
        { promptId: "small_joy", answer: "  Fresh   coffee. " },
        { promptId: "small_joy", answer: "Duplicate." },
        { promptId: "ask_me_about", answer: "Neighborhood cafes." },
        { promptId: "ideal_sunday", answer: "Third must be dropped." }
      ],
      avatar: { presetId: "avatar_v2_body_default" }
    }
  } as never)
  assert.deepEqual(normalized?.profile.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee." },
    { promptId: "ask_me_about", answer: "Neighborhood cafes." }
  ])
})

test("session identity rejects a profile owned by another user", () => {
  const actor = normalizeStoredSessionActor({
    session: {
      userId: "user-1",
      sessionToken: "production-token",
      expiresAt: "2999-01-01T00:00:00.000Z"
    },
    profile: {
      userId: "user-2",
      displayName: "Other User",
      avatar: { presetId: "sunset" }
    }
  })

  assert.equal(actor, null)
})

test("a delayed boot sync cannot apply after a newer local account mutation", () => {
  const bootSyncGeneration = 0
  const generationAfterAvatarSave = 1

  assert.equal(
    shouldApplyProductionAccountSync(
      bootSyncGeneration,
      generationAfterAvatarSave
    ),
    false
  )
  assert.equal(
    shouldApplyProductionAccountSync(bootSyncGeneration, bootSyncGeneration),
    true
  )
})
