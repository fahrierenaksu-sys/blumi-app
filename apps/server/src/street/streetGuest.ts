/**
 * Gezgin kedi lane hook (spec §1): whether a guest pet slept in a room during
 * the previous edition. The pet lane implements it; until then nobody has a guest.
 */
export interface StreetGuestProvider {
  listUsersWithGuest(userIds: readonly string[], editionId: string): Promise<ReadonlySet<string>>
}

export const NO_STREET_GUESTS: StreetGuestProvider = Object.freeze({
  async listUsersWithGuest() {
    return new Set<string>()
  }
})
