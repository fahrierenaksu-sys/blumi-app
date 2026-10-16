import type { AvatarLoadout } from "@blumi/contracts"
import type { AvatarService } from "../avatar/avatarService"
import type { PersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import type { StreetService } from "./streetService"

/**
 * Wraps the loadout and room save paths so a committed change writes the
 * street digest right after it (spec §2). The digest follows the save; it
 * never blocks or fails it (`StreetService.record*` swallow and log by kind).
 * Open: the spec asks for the same transaction as the save.
 */
export function withStreetDigests(input: {
  avatarService: AvatarService
  personalRoomDecorService: PersonalRoomDecorService
  getSessionLoadout(sessionToken: string, now: Date): Promise<{ userId: string; loadout: AvatarLoadout | null } | null>
  streetService: Pick<StreetService, "recordLookSave" | "recordRoomSave">
}): { avatarService: AvatarService; personalRoomDecorService: PersonalRoomDecorService } {
  const { avatarService, personalRoomDecorService, streetService } = input

  const wrappedAvatarService: AvatarService = {
    ...avatarService,
    async saveAvatar(sessionToken, saveInput, now = new Date()) {
      const before = await input.getSessionLoadout(sessionToken, now)
      const result = await avatarService.saveAvatar(sessionToken, saveInput, now)
      if (result.kind === "updated" && before) {
        await streetService.recordLookSave(before.userId, before.loadout, result.selection.loadout, now)
      }
      return result
    }
  }

  const wrappedRoomService: PersonalRoomDecorService = {
    ...personalRoomDecorService,
    async save(userId, saveInput, now = new Date()) {
      const before = await personalRoomDecorService.repository.get(userId)
      const result = await personalRoomDecorService.save(userId, saveInput, now)
      if (result.kind === "saved") {
        await streetService.recordRoomSave(
          userId,
          before?.decor.placedItems ?? null,
          result.snapshot.decor.placedItems,
          result.snapshot.revision,
          now
        )
      }
      return result
    }
  }

  return { avatarService: wrappedAvatarService, personalRoomDecorService: wrappedRoomService }
}
