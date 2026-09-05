import {
  resolveRoomV2StageHeight,
  type ResolvedRoomV2MyRoomCamera
} from "./roomV2Camera"

const MY_ROOM_WIDE_STAGE_MIN_WIDTH = 720
// A taller portrait stage uses the otherwise empty lower canvas for the room,
// while the existing cap still keeps the mode controls reachable above nav.
const MY_ROOM_PORTRAIT_STAGE_HEIGHT_RATIO = 1.4
// Keep the full authored shell, including the left-side door, inside the card.
const MY_ROOM_PORTRAIT_RENDERER_WIDTH_PERCENT = 155
// Reserve the header plus the two-row action dock so the fixed bottom nav never
// covers the final showcase action on portrait phones.
const MY_ROOM_PORTRAIT_CHROME_HEIGHT = 152
const MY_ROOM_PORTRAIT_RENDERER_TRANSLATE_Y = 0

export interface MyRoomLayoutMetricsInput {
  viewportWidth: number
  contentWidth: number
  availableContentHeight: number
  bottomContentInset: number
  camera: ResolvedRoomV2MyRoomCamera
}

export interface MyRoomLayoutMetrics {
  stageHeight: number
  rendererScalePercent: number
  rendererWidth: `${number}%`
  rendererTranslateY: number
  contentBottomPadding: number
  usesWideStageCamera: boolean
}

export function resolveMyRoomLayoutMetrics(
  input: MyRoomLayoutMetricsInput
): MyRoomLayoutMetrics {
  const viewportWidth = finiteNonNegative(input.viewportWidth)
  const contentWidth = finiteNonNegative(input.contentWidth)
  const usesWideStageCamera = viewportWidth >= MY_ROOM_WIDE_STAGE_MIN_WIDTH
  const rendererScalePercent = usesWideStageCamera
    ? 100
    : MY_ROOM_PORTRAIT_RENDERER_WIDTH_PERCENT

  return {
    stageHeight: resolveStageHeight(
      contentWidth,
      finiteNonNegative(input.availableContentHeight),
      finiteNonNegative(input.bottomContentInset),
      usesWideStageCamera,
      input.camera
    ),
    rendererScalePercent,
    rendererWidth: formatPercent(rendererScalePercent),
    rendererTranslateY: usesWideStageCamera
      ? input.camera.rendererTranslateY
      : MY_ROOM_PORTRAIT_RENDERER_TRANSLATE_Y,
    contentBottomPadding: usesWideStageCamera
      ? finiteNonNegative(input.bottomContentInset)
      : 0,
    usesWideStageCamera
  }
}

function resolveStageHeight(
  contentWidth: number,
  availableContentHeight: number,
  bottomContentInset: number,
  usesWideStageCamera: boolean,
  camera: ResolvedRoomV2MyRoomCamera
): number {
  if (usesWideStageCamera) {
    return resolveRoomV2StageHeight(availableContentHeight, true, camera)
  }
  const portraitStageMaximum = Math.max(
    camera.compactMinStageHeight,
    Math.min(
      camera.compactMaxStageHeight,
      availableContentHeight - MY_ROOM_PORTRAIT_CHROME_HEIGHT
    )
  )
  return Math.round(clamp(
    contentWidth * MY_ROOM_PORTRAIT_STAGE_HEIGHT_RATIO + bottomContentInset,
    camera.compactMinStageHeight,
    portraitStageMaximum
  ))
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatPercent(value: number): `${number}%` {
  const formattedValue = Number.isInteger(value)
    ? value
    : Number(value.toFixed(2))
  return `${formattedValue}%`
}
