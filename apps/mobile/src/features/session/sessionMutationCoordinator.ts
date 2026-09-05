import type { SessionActor } from "./sessionModel"

interface MutationTicket {
  generation: number
  userId: string
  mode: SessionActor["session"]["mode"]
  mutation: number | null
}

export class SessionMutationCancelledError extends Error {
  constructor() { super("Your session changed. Please try again.") }
}

/** Serializes local writes, not network requests: logout must not wait for a hung request. */
export function createSessionMutationCoordinator(dependencies: {
  current: () => SessionActor | null
  save: (actor: SessionActor) => Promise<void>
  publish: (actor: SessionActor) => void
}) {
  let generation = 0
  let mutation = 0
  let pending = Promise.resolve()
  function enqueue(work: () => Promise<void>): Promise<void> {
    const result = pending.then(work)
    pending = result.catch(() => undefined)
    return result
  }
  function requireCurrent(ticket: MutationTicket): SessionActor {
    const current = dependencies.current()
    if (ticket.generation !== generation ||
      (ticket.mutation !== null && ticket.mutation !== mutation) || !current ||
      ticket.userId !== current.session.userId || ticket.mode !== current.session.mode) {
      throw new SessionMutationCancelledError()
    }
    return current
  }
  return {
    invalidate() { generation += 1 },
    beginReplacement(): number { generation += 1; return generation },
    capture(actor: SessionActor, isMutation = true): MutationTicket {
      const ticket = { generation, userId: actor.session.userId, mode: actor.session.mode, mutation: null }
      requireCurrent(ticket)
      return { ...ticket, mutation: isMutation ? ++mutation : null }
    },
    commit(ticket: MutationTicket, actor: SessionActor): Promise<void> {
      return enqueue(async () => {
        const current = requireCurrent(ticket)
        const next = {
          ...actor,
          // Mutation payloads cannot roll back credentials rotated during the request.
          session: { ...current.session, onboarding: actor.session.onboarding }
        }
        await dependencies.save(next)
        const afterWrite = dependencies.current()
        if (ticket.generation === generation && ticket.mutation !== null &&
          ticket.mutation !== mutation && afterWrite?.session.userId === ticket.userId &&
          afterWrite.session.mode === ticket.mode) {
          // A newer request started during the write. If that request fails,
          // persistence must still match the last published actor, not this stale result.
          await dependencies.save(afterWrite)
        }
        requireCurrent(ticket)
        dependencies.publish(next)
      })
    },
    async rotate(ticket: MutationTicket, actor: SessionActor): Promise<SessionActor> {
      let rotated = actor
      await enqueue(async () => {
        const current = requireCurrent(ticket)
        rotated = { ...current, session: { ...actor.session, onboarding: current.session.onboarding } }
        await dependencies.save(rotated)
        requireCurrent(ticket)
        dependencies.publish(rotated)
      })
      return rotated
    },
    replace(actor: SessionActor, started: number): Promise<void> {
      return enqueue(async () => {
        if (started !== generation) throw new SessionMutationCancelledError()
        await dependencies.save(actor)
        if (started !== generation) throw new SessionMutationCancelledError()
        dependencies.publish(actor)
      })
    },
    clear(work: () => Promise<void>): Promise<void> { return enqueue(work) }
  }
}
