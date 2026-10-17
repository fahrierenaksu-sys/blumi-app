import type { AvatarLoadout } from "@blumi/contracts"
import type { AuthRepository } from "../auth/authRepository"
import type { PersonalRoomDecorRepository } from "../rooms/personalRoomDecorRepository"
import { diffStreetLook, diffStreetRoom } from "./streetDigest"
import type { StreetRepository } from "./streetRepository"

/** The repositories one save and its street digest write through; in PostgreSQL they share one transaction. */
export interface StreetSaveUnit {
  authRepository: Pick<AuthRepository, "getStoredAvatarLoadout" | "updateAvatarSelection">
  roomRepository: Pick<PersonalRoomDecorRepository, "get" | "save">
  streetRepository: Pick<StreetRepository, "recordLookChange" | "recordRoomChange">
}

/** Runs `work` atomically: when it throws, neither the save nor the digest stays written. */
export type StreetSaveTransaction = <T>(work: (unit: StreetSaveUnit) => Promise<T>) => Promise<T>

/**
 * Wraps the loadout and room saves so a committed change writes its street
 * "changed since yesterday" record in the same transaction (spec §2): a save
 * that fails writes no record, and a record that fails rolls the save back.
 * Until migration 080 is applied (`isStreetReady` false) the save runs alone.
 */
export function withStreetDigestSaves<A extends AuthRepository, R extends PersonalRoomDecorRepository>(input: {
  authRepository: A
  roomRepository: R
  runInTransaction: StreetSaveTransaction
  isStreetReady(): Promise<boolean>
}): { authRepository: A; roomRepository: R } {
  const { runInTransaction, isStreetReady } = input

  const updateAvatarSelection: AuthRepository["updateAvatarSelection"] = async (update) => {
    if (!(await isStreetReady())) return input.authRepository.updateAvatarSelection(update)
    return runInTransaction(async (unit) => {
      const before = await unit.authRepository.getStoredAvatarLoadout(update.accountId)
      const result = await unit.authRepository.updateAvatarSelection(update)
      if (result.kind !== "updated") return result
      const kind = diffStreetLook(toLoadout(before?.loadout), update.selection.loadout)
      if (kind) await unit.streetRepository.recordLookChange(result.account.userId, kind, update.now)
      return result
    })
  }

  const save: PersonalRoomDecorRepository["save"] = async (roomSave) => {
    if (!(await isStreetReady())) return input.roomRepository.save(roomSave)
    return runInTransaction(async (unit) => {
      const before = await unit.roomRepository.get(roomSave.userId)
      const result = await unit.roomRepository.save(roomSave)
      if (result.kind !== "saved") return result
      const kind = diffStreetRoom(before?.decor.placedItems ?? null, result.snapshot.decor.placedItems)
      if (kind) {
        await unit.streetRepository.recordRoomChange(
          roomSave.userId, kind, new Date(roomSave.updatedAt), result.snapshot.revision
        )
      }
      return result
    })
  }

  return {
    authRepository: { ...input.authRepository, updateAvatarSelection },
    roomRepository: { ...input.roomRepository, save }
  }
}

function toLoadout(stored: unknown): AvatarLoadout | null {
  return stored && typeof stored === "object" ? stored as AvatarLoadout : null
}
