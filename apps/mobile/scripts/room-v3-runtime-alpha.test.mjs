import assert from "node:assert/strict"
import test from "node:test"

import { despillLowAlphaChroma } from "./room-v3-runtime-alpha.mjs"

test("despillLowAlphaChroma preserves alpha while clearing low-alpha chroma-key residue", () => {
  const input = Buffer.from([
    0, 255, 0, 1, // green key residue
    255, 0, 255, 2, // magenta key residue
    255, 0, 127, 2, // partially mixed red/magenta fringe
    255, 0, 0, 8, // red key residue
    188, 160, 132, 8, // valid low-alpha warm edge colour
    0, 255, 0, 17, // above the conservative cleanup limit
    12, 23, 34, 0 // fully transparent padding
  ])

  const result = despillLowAlphaChroma(input)

  assert.deepEqual([...result], [
    85, 85, 85, 1,
    170, 170, 170, 2,
    127, 127, 127, 2,
    85, 85, 85, 8,
    188, 160, 132, 8,
    0, 255, 0, 17,
    0, 0, 0, 0
  ])
})
