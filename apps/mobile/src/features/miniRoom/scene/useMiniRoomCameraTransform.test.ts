import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import {
  resolveMiniRoomFollowTarget, resolveMiniRoomPose, resolveMiniRoomPoseEndpoints, type MiniRoomPoseInput
} from "./miniRoomTransitionModel"
import type * as Hook from "./useMiniRoomCameraTransform"

const phone: MiniRoomPoseInput = {
  windowWidth: 414, windowHeight: 896, safeTop: 44, safeBottom: 34, fontScale: 1, roomAspectRatio: 1254 / 714
}

function mount(options: { reduceMotion?: boolean; holdAnimations?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const animations: { target: number; motion: string }[] = []
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/scene/useMiniRoomCameraTransform.ts", runtime, {
    modules: {
      "react-native-reanimated": reanimated.module,
      "react-native-worklets": { scheduleOnUI: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args) },
      "../../../ui/motion": {
        resolveMotion: (reduced: boolean) => ({
          smooth: reduced ? "instant" : "smooth", crossfade: "crossfade"
        }),
        // A held settle stays at its start weight (1), so a test can read the first frame.
        animateTo: (target: number, motion: string) => {
          animations.push({ target, motion })
          return options.holdAnimations ? 1 : target
        }
      }
    },
    real: ["./miniRoomTransitionModel", "./miniRoomLayout", "./miniRoomAvatarStageModel"]
  })
  const keyboard = { visible: false, progress: { value: 0 }, openHeight: { value: 0 } }
  let poseInput = phone
  const render = () => runtime.render(() => hook.useMiniRoomCameraTransform({
    poseInput, keyboard: keyboard as never, reduceMotion: options.reduceMotion ?? false
  }))
  render()
  const api = () => runtime.output as ReturnType<typeof Hook.useMiniRoomCameraTransform>
  /** One UI frame: the derived pose recomputed from the current shared values. */
  const frame = () => { runtime.rerender(); return api() }
  const keyboardAt = (progress: number, openHeight = 336) => {
    keyboard.progress.value = progress
    keyboard.openHeight.value = openHeight
    return frame()
  }
  const commit = (patch: Partial<MiniRoomPoseInput>) => { poseInput = { ...poseInput, ...patch }; render() }
  const setVisible = (visible: boolean) => { keyboard.visible = visible; render() }
  return { runtime, api, frame, keyboardAt, commit, setVisible, animations }
}

const translateX = (style: unknown) => (style as { transform: { translateX?: number }[] }).transform[0]!.translateX!
const scaleOf = (style: unknown) => (style as { transform: { scale?: number }[] }).transform[2]!.scale!

test("the room stays at rest until a real keyboard moves; nothing opens ahead of it", () => {
  const { runtime, api, keyboardAt, setVisible } = mount()
  try {
    const closed = resolveMiniRoomPoseEndpoints(phone, 336).closed
    assert.deepEqual(api().transition.value, closed)
    // A focus with a hardware keyboard: React may hear "visible", but no frame moved.
    setVisible(true)
    assert.deepEqual(keyboardAt(0).transition.value, closed)
  } finally {
    runtime.unmount()
  }
})

test("room camera, paper and content all follow the same keyboard progress, frame by frame and back", () => {
  const { runtime, keyboardAt } = mount()
  try {
    const endpoints = resolveMiniRoomPoseEndpoints(phone, 336)
    for (const progress of [0.1, 0.35, 0.7, 1, 0.8, 0.4, 0]) {
      const api = keyboardAt(progress)
      assert.deepEqual(api.transition.value, resolveMiniRoomPose(endpoints, progress))
      assert.equal(api.contentProgress.value, api.transition.value.progress, "the content rides the same progress")
      assert.equal(scaleOf(api.cameraStyle), api.transition.value.cameraScale)
    }
  } finally {
    runtime.unmount()
  }
})

test("a longer draft settles from the visible pose on the smooth token instead of jumping", () => {
  const { runtime, keyboardAt, commit, frame, animations } = mount({ holdAnimations: true })
  try {
    const visible = keyboardAt(1).transition.value
    commit({ composerLines: 3 })
    const first = frame().transition.value
    assert.equal(first.height, visible.height, "the first frame is where the paper was")
    assert.equal(first.cameraScale, visible.cameraScale)
    assert.deepEqual(animations.at(-1), { target: 0, motion: "smooth" })
  } finally {
    runtime.unmount()
  }
})

test("floor tap: the room pans only when the target would leave the safe frame, and never zooms", () => {
  const { runtime, api, frame, keyboardAt, animations } = mount()
  try {
    keyboardAt(1)
    const scale = scaleOf(api().cameraStyle)
    api().followTo(0.5)
    assert.equal(animations.length, 0, "a target in the middle moves nothing")
    api().followTo(0.04)
    const closed = resolveMiniRoomPoseEndpoints(phone, 336).closed
    const pan = resolveMiniRoomFollowTarget({ pointX: 0.04, frame: closed, windowWidth: phone.windowWidth, current: 0 })
    assert.ok(pan > 0)
    assert.deepEqual(animations.at(-1), { target: pan, motion: "smooth" })
    assert.equal(scaleOf(frame().cameraStyle), scale, "a tap never changes the zoom")
    // The keyboard goes down after the tap; at rest the pan is fully applied.
    assert.equal(translateX(keyboardAt(0).cameraStyle), closed.cameraX + pan)
    api().followTo(0.04)
    assert.equal(animations.length, 1, "the same target again: no second camera move")
  } finally {
    runtime.unmount()
  }
})

test("Reduce Motion: the pose lands with the keyboard and the dock's text crossfades", () => {
  const { runtime, keyboardAt, setVisible, animations, api } = mount({ reduceMotion: true })
  try {
    setVisible(true)
    const open = keyboardAt(1)
    assert.equal(open.transition.value.progress, 1)
    assert.deepEqual(animations.at(-1), { target: 1, motion: "crossfade" })
    assert.equal(api().contentProgress.value, 1)
    api().followTo(0.02)
    assert.equal(animations.at(-1)?.motion, "instant", "a pan lands at once")
  } finally {
    runtime.unmount()
  }
})
