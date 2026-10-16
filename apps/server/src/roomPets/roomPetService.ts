import { randomUUID } from "node:crypto"
import {
  ROOM_PET_CAT_SPECIES_IDS,
  ROOM_PET_SPECIES_IDS,
  isRoomPetSpeciesId,
  normalizeRoomPetName,
  type RoomPetNameProblem
} from "@blumi/domain"
import { isPublicTextAllowed } from "../safety/publicTextFilter"
import type { RoomPetRecord, RoomPetRepository } from "./roomPetRepository"
import type { RoomPetSchemaProbe } from "./roomPetSchema"

/** What the owner's phone may see: never the user id, never another member's pet. */
export interface RoomPetView {
  petId: string
  speciesItemId: string
  /** null after a moderator reset: the app shows the species name instead. */
  name: string | null
  roomState: RoomPetRecord["roomState"]
  revision: number
  createdAt: string
  updatedAt: string
}

export type RoomPetNameRefusal = RoomPetNameProblem | "not_allowed"

export type RoomPetReadResult = { outcome: "unavailable" } | { outcome: "ok"; pet: RoomPetView | null; speciesIds: readonly string[] }

export type RoomPetAdoptResult =
  | { outcome: "unavailable" }
  | { outcome: "invalid_species" }
  | { outcome: "invalid_name"; problem: RoomPetNameRefusal }
  | { outcome: "already_has_pet" }
  | { outcome: "adopted"; pet: RoomPetView }

export type RoomPetRenameResult =
  | { outcome: "unavailable" }
  | { outcome: "invalid_name"; problem: RoomPetNameRefusal }
  | { outcome: "no_pet" }
  | { outcome: "renamed"; pet: RoomPetView }

export interface RoomPetService {
  getMyPet(userId: string): Promise<RoomPetReadResult>
  adopt(userId: string, input: { speciesItemId: unknown; name: unknown }): Promise<RoomPetAdoptResult>
  rename(userId: string, name: unknown): Promise<RoomPetRenameResult>
  /** Whether the server record is authoritative now (flag on and migration 078 applied). */
  isAvailable(): Promise<boolean>
  /** Whether the member owns a cat-species pet; false while unavailable. */
  hasCat(userId: string): Promise<boolean>
  /** Erases the member's pet; returns rows removed (0 while unavailable). */
  deleteUserData(userId: string): Promise<number>
}

/** Counts and outcome codes only: never a user id, a room id or a pet name. */
export type RoomPetReport = (event: string, fields?: Record<string, number | string>) => void

export function createRoomPetService(input: {
  repository: RoomPetRepository
  /** Absent for in-memory storage, which has no migrations. */
  schema?: RoomPetSchemaProbe
  now?: () => Date
  idFactory?: () => string
  report?: RoomPetReport
}): RoomPetService {
  const { repository, schema } = input
  const now = input.now ?? (() => new Date())
  const idFactory = input.idFactory ?? (() => `pet_${randomUUID()}`)
  const report = input.report ?? (() => undefined)
  const isAvailable = async () => (schema ? schema.isReady() : true)

  function checkName(value: unknown): { ok: true; name: string } | { ok: false; problem: RoomPetNameRefusal } {
    const checked = normalizeRoomPetName(value)
    if (!checked.ok) return checked
    if (!isPublicTextAllowed(checked.name)) return { ok: false, problem: "not_allowed" }
    return checked
  }

  return {
    isAvailable,
    async getMyPet(userId) {
      if (!(await isAvailable())) return { outcome: "unavailable" }
      const pet = await repository.findByUser(userId)
      return { outcome: "ok", pet: pet ? toView(pet) : null, speciesIds: ROOM_PET_SPECIES_IDS }
    },
    async adopt(userId, request) {
      if (!(await isAvailable())) return { outcome: "unavailable" }
      if (!isRoomPetSpeciesId(request.speciesItemId)) return { outcome: "invalid_species" }
      const name = checkName(request.name)
      if (!name.ok) {
        report("room_pet.name_refused", { problem: name.problem })
        return { outcome: "invalid_name", problem: name.problem }
      }
      const result = await repository.adopt({
        petId: idFactory(),
        userId,
        speciesItemId: request.speciesItemId,
        name: name.name,
        createdAt: now().toISOString()
      })
      report(`room_pet.${result.outcome}`)
      if (result.outcome === "already_has_pet") return { outcome: "already_has_pet" }
      return { outcome: "adopted", pet: toView(result.pet) }
    },
    async rename(userId, value) {
      if (!(await isAvailable())) return { outcome: "unavailable" }
      const name = checkName(value)
      if (!name.ok) {
        report("room_pet.name_refused", { problem: name.problem })
        return { outcome: "invalid_name", problem: name.problem }
      }
      const pet = await repository.rename(userId, name.name, now().toISOString())
      if (!pet) return { outcome: "no_pet" }
      report("room_pet.renamed")
      return { outcome: "renamed", pet: toView(pet) }
    },
    async hasCat(userId) {
      if (!(await isAvailable())) return false
      const pet = await repository.findByUser(userId)
      return pet !== null && ROOM_PET_CAT_SPECIES_IDS.includes(pet.speciesItemId)
    },
    async deleteUserData(userId) {
      if (!(await isAvailable())) return 0
      return repository.deleteByUser(userId)
    }
  }
}

function toView(pet: RoomPetRecord): RoomPetView {
  return {
    petId: pet.petId,
    speciesItemId: pet.speciesItemId,
    name: pet.nameStatus === "reset" ? null : pet.name,
    roomState: pet.roomState,
    revision: pet.revision,
    createdAt: pet.createdAt,
    updatedAt: pet.updatedAt
  }
}

/**
 * What other server features (the traveling cat's `hasCat`) may ask about a
 * member's pet. `isAuthoritative` is false while the pet flag is off or 078
 * is not applied; a caller then keeps its own fallback instead of reading
 * "no cat" for everyone.
 */
export interface RoomCatOwnership {
  isAuthoritative(): Promise<boolean>
  hasCat(userId: string): Promise<boolean>
}

export function createRoomCatOwnership(service: RoomPetService | undefined): RoomCatOwnership {
  if (!service) return { async isAuthoritative() { return false }, async hasCat() { return false } }
  return { isAuthoritative: () => service.isAvailable(), hasCat: (userId) => service.hasCat(userId) }
}

/** BLUMI_ROOM_PET_ENABLED=1 turns the pet on; anything else (the default) keeps it off with no routes. */
export function isRoomPetEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.BLUMI_ROOM_PET_ENABLED === "1"
}
