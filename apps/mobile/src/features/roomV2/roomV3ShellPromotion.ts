import type { RoomShell } from "./roomV2.types"
import {
  ROOM_V3_ACTIVE_MASTER_GEOMETRY,
  type RoomV3ApprovedMasterGeometry,
  type RoomV3ShellCandidateInput,
  validateRoomV3ShellCandidate
} from "./roomV3ShellProductionContract"
import {
  isTrustedRoomV3ShellArtifactReceipt,
  type RoomV3ShellArtifactReceipt
} from "./roomV3ShellArtifactReceipt"

export interface RoomV3ShellPromotionRecord extends RoomV3ShellCandidateInput {
  shellId: string
}

export const ROOM_V3_TRUSTED_SHELL_ARTIFACT_RECEIPT:
  RoomV3ShellArtifactReceipt | null = null

export function resolveApprovedRoomV3Shells(
  candidateShells: readonly RoomShell[],
  promotionRecords: readonly RoomV3ShellPromotionRecord[],
  masterGeometry: RoomV3ApprovedMasterGeometry | null,
  receipt: RoomV3ShellArtifactReceipt | null =
    ROOM_V3_TRUSTED_SHELL_ARTIFACT_RECEIPT
): RoomShell[] {
  if (
    !masterGeometry ||
    !isApprovedMaster(masterGeometry) ||
    !isTrustedRoomV3ShellArtifactReceipt(receipt) ||
    receipt.masterGeometryId !== masterGeometry.id
  ) {
    return []
  }

  const candidatesById = uniqueById(candidateShells)
  const recordsById = uniqueById(promotionRecords)
  if (!candidatesById || !recordsById) return []

  const approvedShells: RoomShell[] = []
  for (const receiptEntry of receipt.approvedShells) {
    const candidate = candidatesById.get(receiptEntry.shellId)
    const record = recordsById.get(receiptEntry.shellId)
    if (!candidate || !record) return []

    const validation = validateRoomV3ShellCandidate(record, masterGeometry, {
      shellId: receiptEntry.shellId,
      assetKey: candidate.asset.key,
      receipt
    })
    if (!validation.isValid) return []

    approvedShells.push(cloneApprovedShell(candidate))
  }

  return approvedShells
}

function isApprovedMaster(master: RoomV3ApprovedMasterGeometry): boolean {
  return (
    master.id === ROOM_V3_ACTIVE_MASTER_GEOMETRY.id &&
    master.sourceAssetKey === ROOM_V3_ACTIVE_MASTER_GEOMETRY.sourceAssetKey &&
    master.canvasSize.width === ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.width &&
    master.canvasSize.height === ROOM_V3_ACTIVE_MASTER_GEOMETRY.canvasSize.height &&
    master.approvalEvidenceId ===
      ROOM_V3_ACTIVE_MASTER_GEOMETRY.approvalEvidenceId
  )
}

function uniqueById<T extends { id?: string; shellId?: string }>(
  values: readonly T[]
): Map<string, T> | null {
  const result = new Map<string, T>()
  for (const value of values) {
    const id = value.id ?? value.shellId
    if (!id || result.has(id)) return null
    result.set(id, value)
  }
  return result
}

function cloneApprovedShell(shell: RoomShell): RoomShell {
  return {
    ...shell,
    asset: { ...shell.asset },
    canvasSize: { ...shell.canvasSize },
    ...(shell.myRoomCamera
      ? { myRoomCamera: { ...shell.myRoomCamera } }
      : {}),
    ...(shell.miniRoomCamera
      ? { miniRoomCamera: { ...shell.miniRoomCamera } }
      : {}),
    ...(shell.placeableArea
      ? { placeableArea: { ...shell.placeableArea } }
      : {}),
    ...(shell.surfacePlacementAreas
      ? { surfacePlacementAreas: { ...shell.surfacePlacementAreas } }
      : {}),
    ...(shell.surfacePlacementExclusions
      ? {
          surfacePlacementExclusions: Object.fromEntries(
            Object.entries(shell.surfacePlacementExclusions).map(([surface, bounds]) => [
              surface,
              bounds?.map((bound) => ({ ...bound }))
            ])
          )
        }
      : {}),
    ...(shell.walkablePolygon
      ? { walkablePolygon: shell.walkablePolygon.map((point) => ({ ...point })) }
      : {}),
    ...(shell.placementLanes
      ? { placementLanes: shell.placementLanes.map((lane) => ({ ...lane })) }
      : {}),
    sourceStatus: "approved",
    qaStatus: "pass"
  }
}
