import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const producer = resolve("apps/mobile/scripts/prepare_female_bottom_motion_staging.py")

test("female bottom motion staging covers seven items without live writes", () => {
  assert.equal(existsSync(producer), true, "bottom staging producer is required")
  const result = spawnSync("python3", [producer, "--check"], { encoding: "utf8" })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /"itemCount": 7/)
  assert.match(result.stdout, /"liveAssetsUntouched": true/)
  assert.match(result.stdout, /"stagedReviewCandidates": 4/)
  assert.match(result.stdout, /"delegatedLongPantRefitCandidates": 3/)
})

test("four skirt and shorts candidates include Static+4W+1S evidence and transition gates", () => {
  const metricsPath = resolve(
    "docs/avatar-motion-pipeline/female-bottom-motion-staging/2026-07-15-female-bottom-motion-metrics.json",
  )
  const metrics = JSON.parse(readFileSync(metricsPath, "utf8"))
  const staged = metrics.items.filter((item) => item.decision.startsWith("STAGED_"))
  assert.equal(staged.length, 4)
  for (const item of staged) {
    const evidenceDir = resolve(
      "docs/avatar-motion-pipeline/female-bottom-motion-staging/evidence",
      item.item,
    )
    assert.equal(existsSync(resolve(evidenceDir, "static-4w1s-full-body-contact-sheet.png")), true)
    assert.equal(existsSync(resolve(evidenceDir, "static-4w1s-waist-crotch-hem-shoe-closeups.png")), true)
    assert.equal(item.transitionGatesPassed, true, `${item.item} transition gates failed`)
    assert.equal(item.alphaVisibleGreenPixels, 0, `${item.item} has visible green fringe`)
    assert.ok(item.uniqueFrameCount >= 5, `${item.item} has too few distinct pose frames`)
    assert.equal(item.uniqueWalkingFrameCount, 4, `${item.item} has duplicate walking frames`)
    assert.ok(item.staticW1BboxIoU >= 0.8, `${item.item} idle-to-walk bbox pop`)
    assert.ok(item.maxCenterlineDeviation <= 3, `${item.item} centerline drift`)
    assert.ok(item.walkingWidthRange <= 7, `${item.item} width continuity`)
    assert.ok(item.walkingTopRange <= 2, `${item.item} waist continuity`)
    assert.ok(item.walkingHemRange <= 7, `${item.item} hem continuity`)
    assert.equal(item.waistHemGatePassed, true, `${item.item} waist/hem bbox gate`)
    assert.equal(item.shoeContactPassed, true, `${item.item} shoe contact gate`)
    assert.equal(item.shoeContactDeltas.length, 6)
  }
})

test("staged frames contain only their expected garment silhouette components", () => {
  const result = spawnSync("python3", ["-c", String.raw`
from pathlib import Path
from PIL import Image

root = Path('docs/avatar-motion-pipeline/female-bottom-motion-staging/extracted')
slugs = (
    'layered_lace_ruffle_mini_skirt', 'yellow_bow_lace_ruffle_skirt',
    'denim_skort_shorts', 'striped_crochet_shorts',
)
states = ('static', 'walking_front_f01', 'walking_front_f02', 'walking_front_f03', 'walking_front_f04', 'sitting_front_f01')

def count_components(image, threshold):
    alpha = image.getchannel('A')
    width, height = image.size
    visible = {index for index, value in enumerate(alpha.getdata()) if value > threshold}
    components = 0
    while visible:
        components += 1
        stack = [visible.pop()]
        while stack:
            current = stack.pop()
            x, y = current % width, current // width
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                neighbor = ny * width + nx
                if 0 <= nx < width and 0 <= ny < height and neighbor in visible:
                    visible.remove(neighbor)
                    stack.append(neighbor)
    return components

for slug in slugs:
    for state in states:
        name = f'avatar_room_bottom_female_{slug}_v2.png' if state == 'static' else f'room_avatar_bottom_female_{slug}_v2_{state}.png'
        path = root / slug / name
        threshold = 0 if slug.endswith('_pants') else 16
        count = count_components(Image.open(path).convert('RGBA'), threshold)
        if slug in ('denim_skort_shorts', 'striped_crochet_shorts'):
            # Front-facing shorts can read as one joined silhouette while
            # walking, or two deliberate leg silhouettes. A third island is
            # always detached debris.
            assert count in (1, 2), f'{path}: expected one or two short-leg components, got {count}'
        else:
            assert count == 1, f'{path}: expected one visible garment component, got {count}'
`], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test("PNG recomputation rejects forged transition metrics", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import importlib.util
import json
from pathlib import Path
from PIL import Image

script = Path('apps/mobile/scripts/prepare_female_bottom_motion_staging.py')
spec = importlib.util.spec_from_file_location('bottom_staging', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

slug = 'denim_skort_shorts'
config = module.ITEMS[slug]
root = Path('docs/avatar-motion-pipeline/female-bottom-motion-staging/extracted') / slug
frames = [Image.open(root / module.staged_filename(slug, state)).convert('RGBA') for state in module.STAGED_STATES]
metrics = json.loads(module.METRICS.read_text())
claimed = next(item for item in metrics['items'] if item['item'] == slug)
assert module.verify_transition_record(frames, str(config['role']), claimed) == []

duplicate = [frame.copy() for frame in frames]
duplicate[2] = duplicate[1].copy()
failures = module.verify_transition_record(duplicate, str(config['role']), claimed)
assert any('uniqueFrameCount' in failure for failure in failures), failures

green = [frame.copy() for frame in frames]
left, top, _, _ = module.visible_bbox(green[3])
green[3].putpixel((left + 4, top + 4), (0, 255, 0, 255))
failures = module.verify_transition_record(green, str(config['role']), claimed)
assert any('alphaVisibleGreenPixels' in failure for failure in failures), failures

shifted = [frame.copy() for frame in frames]
canvas = Image.new('RGBA', module.CANVAS, (0, 0, 0, 0))
canvas.alpha_composite(shifted[0], (24, 0))
shifted[0] = canvas
failures = module.verify_transition_record(shifted, str(config['role']), claimed)
assert any('staticW1BboxIoU' in failure or 'maxCenterlineDeviation' in failure for failure in failures), failures
`], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
