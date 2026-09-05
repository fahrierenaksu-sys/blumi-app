export interface AvatarEquipLifecycle {
  readonly mounted: boolean
  readonly generation: number
}

export interface AvatarEquipSaveStart {
  readonly lifecycle: AvatarEquipLifecycle
  readonly requestGeneration: number
}

export function createAvatarEquipLifecycle(): AvatarEquipLifecycle {
  return { mounted: true, generation: 0 }
}

export function beginAvatarEquipSave(
  lifecycle: AvatarEquipLifecycle
): AvatarEquipSaveStart {
  const nextLifecycle = {
    ...lifecycle,
    generation: lifecycle.generation + 1
  }
  return {
    lifecycle: nextLifecycle,
    requestGeneration: nextLifecycle.generation
  }
}

export function invalidateAvatarEquipSaves(
  lifecycle: AvatarEquipLifecycle
): AvatarEquipLifecycle {
  return {
    ...lifecycle,
    generation: lifecycle.generation + 1
  }
}

export function markAvatarEquipLifecycleUnmounted(
  lifecycle: AvatarEquipLifecycle
): AvatarEquipLifecycle {
  return {
    mounted: false,
    generation: lifecycle.generation + 1
  }
}

export function mayCommitAvatarEquipSave(
  lifecycle: AvatarEquipLifecycle,
  requestGeneration: number
): boolean {
  return lifecycle.mounted && lifecycle.generation === requestGeneration
}

export function markAvatarLocallyCustomized(): true {
  return true
}
