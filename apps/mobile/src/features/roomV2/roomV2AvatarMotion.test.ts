import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  getRoomV2AvatarSittingTranslateY,
  ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
} from "./roomV2AvatarMotion"

const rendererSource = readFileSync(
  resolve(process.cwd(), "src/features/roomV2/components/RoomRenderer2D.tsx"),
  "utf8"
)

test("sitting rig converts the normalized seat height into a responsive stage offset", () => {
  assert.equal(ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX, 47)
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.09 }, 1_000),
    137
  )
  assert.equal(getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 1_000), 103)
  assert.equal(getRoomV2AvatarSittingTranslateY({ seatHeight: 0.085 }, 800), 115)
  assert.ok(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.09 }, 1_000) >
      getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 1_000),
    "a taller seat must preserve the larger normalized vertical drop"
  )
})

test("sitting rig fails safe to the calibrated default until layout and metadata are valid", () => {
  assert.equal(getRoomV2AvatarSittingTranslateY(), ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX)
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: Number.NaN }, 1_000),
    ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
  )
  assert.equal(
    getRoomV2AvatarSittingTranslateY({ seatHeight: 0.056 }, 0),
    ROOM_V2_DEFAULT_SITTING_TRANSLATE_Y_PX
  )
})

test("the approved sitting frame keeps the standing avatar scale", () => {
  assert.doesNotMatch(rendererSource, /motion\.state === "sitting"\) return 0\.82/)
  assert.match(rendererSource, /stageHeightPx=\{layoutSize\.height\}/)
})
