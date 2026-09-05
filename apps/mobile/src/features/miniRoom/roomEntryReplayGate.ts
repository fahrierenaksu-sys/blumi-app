export interface RoomEntryReplayGate {
  requested: boolean
  observedLoading: boolean
  replayed: boolean
  canReplay: boolean
}

export type RoomEntryReplayGateEvent = "requested" | "loading" | "ready" | "replayed"

export function createRoomEntryReplayGate(): RoomEntryReplayGate {
  return {
    requested: false,
    observedLoading: false,
    replayed: false,
    canReplay: false
  }
}

export function advanceRoomEntryReplayGate(
  current: RoomEntryReplayGate,
  event: RoomEntryReplayGateEvent
): RoomEntryReplayGate {
  if (event === "requested") {
    return { requested: true, observedLoading: false, replayed: false, canReplay: false }
  }
  if (event === "loading") {
    return current.requested
      ? { ...current, observedLoading: true, canReplay: false }
      : current
  }
  if (event === "ready") {
    return {
      ...current,
      canReplay: current.requested && current.observedLoading && !current.replayed
    }
  }
  return { ...current, replayed: true, canReplay: false }
}
