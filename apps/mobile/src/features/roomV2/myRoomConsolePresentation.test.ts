import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const myRoomSource = readFileSync(
  resolve(process.cwd(), "src/screens/MyRoomScreen.tsx"),
  "utf8"
)

test("My Room controls use one calm room surface with one dominant edit action", () => {
  const roomControlPanelBlock = getStyleBlock("roomControlPanel")
  const stageActionDockBlock = getStyleBlock("stageActionDock")
  const stageActionItemBlock = getStyleBlock("stageActionItem")

  assert.match(
    myRoomSource,
    /roomStack:\s*\{[\s\S]*?gap:\s*0,[\s\S]*?backgroundColor:\s*"#E8B698"/
  )
  assert.match(roomControlPanelBlock, /backgroundColor:\s*"#E8B698"/)
  assert.doesNotMatch(roomControlPanelBlock, /borderTopWidth/)
  assert.match(stageActionDockBlock, /flexDirection:\s*"row"/)
  assert.match(stageActionDockBlock, /minHeight:\s*56/)
  assert.match(stageActionDockBlock, /borderRadius:\s*18/)
  assert.match(stageActionDockBlock, /backgroundColor:\s*"#FFF8F6"/)
  assert.match(stageActionDockBlock, /borderColor:\s*"#F0E1E7"/)
  assert.match(stageActionItemBlock, /minHeight:\s*52/)
  assert.match(stageActionItemBlock, /flexDirection:\s*"row"/)
  assert.match(stageActionItemBlock, /borderRadius:\s*12/)
  assert.match(stageActionItemBlock, /backgroundColor:\s*"transparent"/)
  assert.doesNotMatch(stageActionItemBlock, /borderWidth/)
  assert.match(
    myRoomSource,
    /stageCard:\s*\{[\s\S]*?borderTopLeftRadius:\s*33,[\s\S]*?borderTopRightRadius:\s*33/
  )
  assert.match(
    myRoomSource,
    /stageActionItem:\s*\{[\s\S]*?minHeight:\s*52,/
  )
  assert.doesNotMatch(myRoomSource, /stageActionRow/)
  assert.doesNotMatch(myRoomSource, /stageActionButtonShowcase/)
  assert.doesNotMatch(myRoomSource, /stageActionIconWrap/)
  assert.match(myRoomSource, /stageActionDivider/)
  assert.match(myRoomSource, /styles\.stageActionItemPrimary/)
  assert.doesNotMatch(myRoomSource, /Ready room/)
  assert.doesNotMatch(myRoomSource, /stageHudMetaGroup/)
})

function getStyleBlock(name: string): string {
  const match = myRoomSource.match(
    new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`)
  )
  assert.ok(match?.[1], `Expected ${name} style block`)
  return match[1]
}
