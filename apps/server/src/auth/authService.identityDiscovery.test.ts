import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "./authService"

async function createSignedInService() {
  const service = createAuthService({ codeFactory: () => "482931" })
  await service.sendCode("+905551112233")
  const signedIn = await service.verifyCode("+905551112233", "482931")
  return { service, token: signedIn.sessionToken, actor: signedIn.account }
}

test("identity and discovery preferences persist without changing avatar body", async () => {
  const { service, token, actor } = await createSignedInService()
  const avatarBefore = actor.profile.avatar
  const updated = await service.updateProfile(token, {
    identityGender: "man",
    discoveryPreferences: {
      ageMin: 23,
      ageMax: 35,
      genders: ["woman"],
      vibes: ["coffee", "slow burn"],
      radiusKm: 25
    }
  })

  assert.equal(updated?.identityGender, "man")
  assert.deepEqual(updated?.discoveryPreferences, {
    ageMin: 23,
    ageMax: 35,
    genders: ["woman"],
    vibes: ["coffee", "slow burn"],
    radiusKm: 25
  })
  assert.deepEqual(updated?.avatar, avatarBefore)
})

test("discovery preferences reject unsupported radius and invalid age ranges", async () => {
  const { service, token } = await createSignedInService()
  await assert.rejects(
    service.updateProfile(token, {
      discoveryPreferences: {
        ageMin: 40,
        ageMax: 20,
        genders: [],
        vibes: [],
        radiusKm: 999
      }
    } as never),
    /preferences/i
  )
})
