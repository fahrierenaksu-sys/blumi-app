import AsyncStorage from "@react-native-async-storage/async-storage"

const PENDING_INVITES_KEY = "@blumi/outboundPendingInvites/v1"

export interface PendingInviteMemory {
  userId: string
  displayName: string
  sentAt: number
}

interface StoredPendingInvite extends PendingInviteMemory {
  actorUserId: string
}

function parseStoredInvites(rawValue: string | null): StoredPendingInvite[] {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is StoredPendingInvite => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.actorUserId === "string" &&
        typeof entry.userId === "string" &&
        typeof entry.displayName === "string" &&
        typeof entry.sentAt === "number"
      )
    })
  } catch {
    return []
  }
}

async function readStoredInvites(): Promise<StoredPendingInvite[]> {
  const rawValue = await AsyncStorage.getItem(PENDING_INVITES_KEY)
  return parseStoredInvites(rawValue)
}

async function writeStoredInvites(invites: StoredPendingInvite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_INVITES_KEY, JSON.stringify(invites))
  } catch {
    // best-effort local memory only
  }
}

function isFresh(invite: PendingInviteMemory, now: number, ttlMs: number): boolean {
  return now - invite.sentAt < ttlMs
}

export async function loadPendingInvitesForUser(input: {
  actorUserId: string
  now: number
  ttlMs: number
}): Promise<PendingInviteMemory[]> {
  const allInvites = await readStoredInvites()
  const freshInvites = allInvites.filter((invite) =>
    isFresh(invite, input.now, input.ttlMs)
  )
  if (freshInvites.length !== allInvites.length) {
    await writeStoredInvites(freshInvites)
  }
  return freshInvites
    .filter((invite) => invite.actorUserId === input.actorUserId)
    .map(({ userId, displayName, sentAt }) => ({ userId, displayName, sentAt }))
}

export async function replacePendingInvitesForUser(input: {
  actorUserId: string
  invites: PendingInviteMemory[]
  now: number
  ttlMs: number
}): Promise<void> {
  const allInvites = await readStoredInvites()
  const otherUsersInvites = allInvites.filter(
    (invite) =>
      invite.actorUserId !== input.actorUserId &&
      isFresh(invite, input.now, input.ttlMs)
  )
  const actorInvites = input.invites
    .filter((invite) => isFresh(invite, input.now, input.ttlMs))
    .map((invite) => ({
      ...invite,
      actorUserId: input.actorUserId
    }))
  await writeStoredInvites([...otherUsersInvites, ...actorInvites])
}

export async function recordPendingInviteForUser(input: {
  actorUserId: string
  invite: PendingInviteMemory
  now: number
  ttlMs: number
}): Promise<void> {
  const current = await loadPendingInvitesForUser(input)
  await replacePendingInvitesForUser({
    actorUserId: input.actorUserId,
    invites: [
      ...current.filter((invite) => invite.userId !== input.invite.userId),
      input.invite
    ],
    now: input.now,
    ttlMs: input.ttlMs
  })
}
