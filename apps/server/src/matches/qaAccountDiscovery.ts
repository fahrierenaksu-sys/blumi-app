import type { AuthRepository } from "../auth/authRepository"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore,
  type DiscoverProfileRecord,
  type MatchRepository
} from "./matchRepository"

/**
 * Local Simulator QA only. The memory server's Discover deck holds demo profiles, never signed-up accounts, so two
 * QA users could never like each other. With QA auth on (loopback, memory, development: config.ts) a QA account
 * becomes discoverable the moment the like route looks it up, and the normal like -> match -> thread path runs
 * unchanged. Only the listed QA phone numbers are ever published; anyone else stays invisible.
 */
export function createQaAccountDiscoveryRepository(input: {
  authRepository: Pick<AuthRepository, "findAccountByUserId">
  qaPhoneNumbers: readonly string[]
}): MatchRepository {
  const store = createInMemoryMatchStore()
  const base = createInMemoryMatchRepository(store)

  async function publishQaAccount(userId: string): Promise<void> {
    const account = await input.authRepository.findAccountByUserId(userId)
    if (!account || !input.qaPhoneNumbers.includes(account.phoneNumber)) return
    const { profile } = account
    if (typeof profile.age !== "number" || !profile.gender || profile.gender === "non-binary") return
    const record: DiscoverProfileRecord = {
      userId: profile.userId,
      displayName: profile.displayName,
      age: profile.age,
      gender: profile.gender,
      distanceLabel: "1 km away",
      vibeTags: [],
      avatar: normalizeStoredAvatarSelection({
        presetId: profile.avatar.presetId,
        loadout: profile.avatar.loadout,
        revision: profile.avatar.revision
      }),
      avatarPresetId: profile.avatar.presetId
    }
    store.discoverProfiles.set(userId, record)
  }

  return {
    ...base,
    async findDiscoverProfile(userId) {
      await publishQaAccount(userId)
      return base.findDiscoverProfile(userId)
    },
    async findEligibleDiscoverProfile(currentUserId, targetUserId, filters, currentUserGender) {
      await publishQaAccount(targetUserId)
      return base.findEligibleDiscoverProfile(currentUserId, targetUserId, filters, currentUserGender)
    }
  }
}
