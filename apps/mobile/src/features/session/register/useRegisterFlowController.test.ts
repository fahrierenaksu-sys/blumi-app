import assert from "node:assert/strict"
import Module, { createRequire } from "node:module"
import { resolve } from "node:path"
import test, { mock } from "node:test"
import { LEGAL_DOCUMENT_VERSION } from "../../legal/legalPolicyMetadata"
import { getAuthEntryCopy } from "../authEntryCopy"
import type { RegisterAccountInput } from "../sessionApi"
import type {
  RegisterFlowControllerInput,
  useRegisterFlowController as UseRegisterFlowController
} from "./useRegisterFlowController"

// A minimal synchronous hooks runtime: enough React semantics (state slots,
// memo and effect dependencies, refs, effect cleanup) to drive the controller
// the way the Register views do, without a native renderer.
type Slot = {
  value?: unknown
  deps?: readonly unknown[]
  cleanup?: (() => void) | void
  current?: unknown
}

function depsChanged(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  if (!previous || !next) return true
  return next.length !== previous.length ||
    next.some((value, index) => !Object.is(value, previous[index]))
}

function createHookRuntime() {
  const slots: Slot[] = []
  let cursor = 0
  let layoutEffects: (() => void)[] = []
  let passiveEffects: (() => void)[] = []

  const scheduleEffect = (
    queue: (() => void)[],
    effect: () => (() => void) | void,
    deps?: readonly unknown[]
  ) => {
    const index = cursor++
    const previous = slots[index]
    if (previous && !depsChanged(previous.deps, deps)) return
    slots[index] = { deps, cleanup: previous?.cleanup }
    queue.push(() => {
      slots[index].cleanup?.()
      slots[index].cleanup = effect()
    })
  }

  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      if (!slots[index]) {
        slots[index] = {
          value: typeof initial === "function" ? (initial as () => T)() : initial
        }
      }
      const slot = slots[index]
      const setState = (next: T | ((current: T) => T)) => {
        slot.value = typeof next === "function"
          ? (next as (current: T) => T)(slot.value as T)
          : next
      }
      return [slot.value as T, setState] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      if (!slots[index]) slots[index] = { current: initial }
      return slots[index] as { current: T }
    },
    useMemo<T>(calculate: () => T, deps: readonly unknown[]) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || depsChanged(previous.deps, deps)) {
        slots[index] = { value: calculate(), deps }
      }
      return slots[index].value as T
    },
    useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]) {
      scheduleEffect(passiveEffects, effect, deps)
    },
    useLayoutEffect(effect: () => (() => void) | void, deps?: readonly unknown[]) {
      scheduleEffect(layoutEffects, effect, deps)
    }
  }

  function render<T>(hook: () => T): T {
    cursor = 0
    layoutEffects = []
    passiveEffects = []
    const result = hook()
    for (const effect of layoutEffects) effect()
    for (const effect of passiveEffects) effect()
    return result
  }

  return { react, render }
}

type FirebaseStub = {
  currentPhoneNumber: string | null
  listener: ((phoneNumber: string | null) => void) | null
  unsubscribed: number
}

function loadController(
  runtime: ReturnType<typeof createHookRuntime>,
  firebase: FirebaseStub,
  haptics: string[]
) {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = loader._load
  loader._load = function load(request, parent, isMain) {
    if (request === "react") return runtime.react
    if (request === "../../../ui/haptics") {
      return {
        hapticSuccess: () => { haptics.push("success") },
        hapticError: () => { haptics.push("error") }
      }
    }
    if (request === "../firebasePhoneAuth") {
      return {
        getFirebaseCurrentPhoneNumber: () => firebase.currentPhoneNumber,
        subscribeToFirebasePhoneNumber: (listener: (phoneNumber: string | null) => void) => {
          firebase.listener = listener
          return () => { firebase.unsubscribed += 1 }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const requireFromHere = createRequire(resolve(import.meta.dirname, "index.ts"))
    const modulePath = requireFromHere.resolve("./useRegisterFlowController")
    delete requireFromHere.cache[modulePath]
    return (requireFromHere(modulePath) as {
      useRegisterFlowController: typeof UseRegisterFlowController
    }).useRegisterFlowController
  } finally {
    loader._load = originalLoad
  }
}

const trCopy = getAuthEntryCopy("tr")
const VALID_TR_LOCAL = "5321234567"
const VALID_TR_E164 = "+905321234567"

function mountController(
  overrides: Partial<RegisterFlowControllerInput> = {},
  options: { firebasePhoneNumber?: string | null } = {}
) {
  const runtime = createHookRuntime()
  const firebase: FirebaseStub = {
    currentPhoneNumber: options.firebasePhoneNumber ?? null,
    listener: null,
    unsubscribed: 0
  }
  const haptics: string[] = []
  const useRegisterFlowController = loadController(runtime, firebase, haptics)
  const events: string[] = []
  const codeRequests: { phoneNumber: string }[] = []
  const registrations: RegisterAccountInput[] = []
  const stageChanges: ("phone" | "otp")[] = []
  const pending: {
    request: { resolve: () => void; reject: (error: Error) => void } | null
  } = { request: null }
  let requestOutcome: "resolve" | "reject" | "defer" = "resolve"
  let registerOutcome: "resolve" | "reject" = "resolve"
  const focusCalls: number[] = []
  const input: RegisterFlowControllerInput = {
    authIntent: "create",
    locale: "tr",
    authCopy: trCopy,
    isSubmitting: false,
    errorMessage: null,
    onRequestVerificationCode: async (request) => {
      events.push("request-code")
      codeRequests.push(request)
      if (requestOutcome === "reject") throw new Error("provider unavailable")
      if (requestOutcome === "defer") {
        await new Promise<void>((resolveRequest, rejectRequest) => {
          pending.request = { resolve: resolveRequest, reject: rejectRequest }
        })
      }
    },
    onRegister: async (registration) => {
      events.push("register")
      registrations.push(registration)
      if (registerOutcome === "reject") throw new Error("invalid code")
    },
    onClearError: () => { events.push("clear-error") },
    onCreateFlowStageChange: (stage) => { stageChanges.push(stage) },
    ...overrides
  }
  let controller = runtime.render(() => useRegisterFlowController(input))
  controller.phoneInputRef.current = {
    focus: () => { focusCalls.push(1) }
  } as unknown as NonNullable<typeof controller.phoneInputRef.current>
  const otpFocusCalls: number[] = []
  controller.otpInputRef.current = {
    focus: () => { otpFocusCalls.push(1) }
  } as unknown as NonNullable<typeof controller.otpInputRef.current>

  const rerender = (next: Partial<RegisterFlowControllerInput> = {}) => {
    Object.assign(input, next)
    controller = runtime.render(() => useRegisterFlowController(input))
    return controller
  }
  const act = async (action: (current: typeof controller) => void) => {
    action(controller)
    rerender()
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolveTurn) => setImmediate(resolveTurn))
      rerender()
    }
    return controller
  }

  return {
    get controller() { return controller },
    rerender,
    act,
    events,
    codeRequests,
    registrations,
    stageChanges,
    focusCalls,
    otpFocusCalls,
    haptics,
    firebase,
    pending,
    setRequestOutcome(outcome: "resolve" | "reject" | "defer") { requestOutcome = outcome },
    setRegisterOutcome(outcome: "resolve" | "reject") { registerOutcome = outcome }
  }
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] })
})

test.afterEach(() => {
  mock.timers.reset()
})

async function enterValidPhone(harness: ReturnType<typeof mountController>) {
  await harness.act((controller) => controller.handlePhoneChange(VALID_TR_LOCAL))
}

test("create keeps the send-code action disabled until a valid phone and the terms are accepted", async () => {
  const harness = mountController()
  assert.equal(harness.controller.primaryDisabled, true)
  assert.deepEqual(harness.stageChanges, ["phone"])

  await enterValidPhone(harness)
  assert.equal(harness.controller.availability.phoneValid, true)
  assert.equal(harness.controller.primaryDisabled, true, "terms are still required")

  await harness.act((controller) => controller.toggleTermsAccepted())
  assert.equal(harness.controller.termsAccepted, true)
  assert.equal(harness.controller.primaryDisabled, false)

  // Blocked attempt without terms: no provider call, and no focus jump for a valid phone.
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.codeRequests.length, 0)
  assert.equal(harness.focusCalls.length, 0)
  assert.equal(harness.controller.attemptedPrimaryAction, true)
})

test("an invalid phone is rejected locally, shows its error, and returns focus to the field", async () => {
  const harness = mountController()
  await harness.act((controller) => controller.handlePhoneChange("12"))
  assert.equal(harness.controller.showPhoneError, false, "no error while typing before blur")
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())

  assert.equal(harness.codeRequests.length, 0)
  assert.equal(harness.focusCalls.length, 1)
  assert.equal(harness.controller.showPhoneError, true)

  await harness.act((controller) => controller.handlePhoneChange("123"))
  assert.equal(harness.controller.attemptedPrimaryAction, false, "typing clears the attempt feedback")
  assert.equal(harness.controller.showPhoneError, false)
  await harness.act((controller) => controller.handlePhoneBlur())
  assert.equal(harness.controller.showPhoneError, true)
})

test("requesting a code advances to OTP before the provider call and starts the resend cooldown", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  harness.events.length = 0

  await harness.act((controller) => controller.runPrimaryAction())

  assert.deepEqual(harness.events, ["clear-error", "request-code"])
  assert.deepEqual(harness.codeRequests, [{ phoneNumber: VALID_TR_E164 }])
  assert.equal(harness.controller.isCodeStep, true)
  assert.deepEqual(harness.stageChanges, ["phone", "otp"])
  assert.equal(harness.controller.codeRequestStatus, "sent")
  assert.equal(harness.controller.smsNotice, trCopy.codeExpiresSoon)
  assert.equal(harness.controller.resendCooldownSeconds, 30)
  assert.equal(harness.controller.busy, false)
  assert.equal(harness.controller.primaryDisabled, true, "the code is still empty")
})

test("resend is blocked during the cooldown and sends a fresh code once it reaches zero", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.codeRequests.length, 1)

  await harness.act((controller) => controller.resendCode())
  assert.equal(harness.codeRequests.length, 1, "cooldown blocks resend")

  mock.timers.tick(1000)
  harness.rerender()
  assert.equal(harness.controller.resendCooldownSeconds, 29)
  for (let second = 0; second < 29; second += 1) {
    mock.timers.tick(1000)
    harness.rerender()
  }
  assert.equal(harness.controller.resendCooldownSeconds, 0)
  mock.timers.tick(5000)
  harness.rerender()
  assert.equal(harness.controller.resendCooldownSeconds, 0, "the cooldown never goes negative")

  await harness.act((controller) => controller.resendCode())
  assert.equal(harness.codeRequests.length, 2)
  assert.equal(harness.controller.smsNotice, trCopy.freshCodeSent)
  assert.equal(harness.controller.resendCooldownSeconds, 30)
})

test("a parent back request leaves the code step and reports the phone stage once", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.controller.isCodeStep, true)

  harness.rerender({ returnToPhoneRequest: 1 })
  await harness.act(() => {})
  assert.equal(harness.controller.isCodeStep, false)
  assert.deepEqual(harness.stageChanges, ["phone", "otp", "phone"])

  // Re-rendering with the same request does not repeat it.
  await harness.act(() => {})
  assert.deepEqual(harness.stageChanges, ["phone", "otp", "phone"])
})

test("a failed first request marks the code as not sent; a failed resend keeps the earlier code usable", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  harness.setRequestOutcome("reject")
  await harness.act((controller) => controller.runPrimaryAction())

  assert.equal(harness.controller.isCodeStep, true)
  assert.equal(harness.controller.codeRequestStatus, "failed")
  assert.equal(harness.controller.smsNotice, trCopy.codeNotSent)
  assert.equal(harness.controller.resendCooldownSeconds, 0)
  await harness.act((controller) => controller.handleCodeChange("123456"))
  assert.equal(harness.controller.primaryDisabled, true, "no sent code to verify against")
  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.registrations.length, 0)

  harness.setRequestOutcome("resolve")
  await harness.act((controller) => controller.resendCode())
  assert.equal(harness.controller.codeRequestStatus, "sent")
  for (let second = 0; second < 30; second += 1) {
    mock.timers.tick(1000)
    harness.rerender()
  }
  harness.setRequestOutcome("reject")
  await harness.act((controller) => controller.resendCode())
  assert.equal(harness.controller.codeRequestStatus, "sent")
  assert.equal(harness.controller.smsNotice, trCopy.resendFailed)
})

test("verification waits for a complete code and submits the create registration with the terms acceptance", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())

  await harness.act((controller) => controller.handleCodeChange("123"))
  assert.equal(harness.controller.primaryDisabled, true)
  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.registrations.length, 0)
  assert.equal(harness.controller.showOtpError, true)

  harness.events.length = 0
  await harness.act((controller) => controller.handleCodeChange("123456"))
  assert.equal(harness.controller.showOtpError, false)

  // The sixth digit verifies the code without another tap (ONB-12).
  assert.deepEqual(harness.events, ["clear-error", "register"])
  assert.deepEqual(harness.haptics, ["success"])
  assert.deepEqual(harness.registrations, [{
    phoneNumber: VALID_TR_E164,
    verificationCode: "123456",
    authIntent: "create",
    termsAcceptance: { version: LEGAL_DOCUMENT_VERSION, locale: "tr" }
  }])
  assert.equal(harness.controller.busy, false)
})

test("OTP focus and blur drive the active cell and the touched error without touching the code", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  await harness.act((controller) => controller.handleCodeChange("12"))

  await harness.act((controller) => controller.handleOtpFocus())
  assert.equal(harness.controller.otpFocused, true)
  assert.equal(harness.controller.showOtpError, false)
  await harness.act((controller) => controller.handleOtpBlur())
  assert.equal(harness.controller.otpFocused, false)
  assert.equal(harness.controller.showOtpError, true)
  assert.equal(harness.controller.flow.verificationCode, "12")
})

test("concurrent primary presses send one code request", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  harness.setRequestOutcome("defer")
  await harness.act((controller) => {
    controller.runPrimaryAction()
    controller.runPrimaryAction()
  })
  assert.equal(harness.codeRequests.length, 1)
  assert.equal(harness.controller.busy, true)
  assert.equal(harness.controller.codeRequestStatus, "sending")
  assert.equal(harness.controller.smsNotice, trCopy.sendingCode)

  await harness.act((controller) => controller.resendCode())
  assert.equal(harness.codeRequests.length, 1, "in-flight work blocks resend")

  harness.pending.request?.resolve()
  await harness.act(() => undefined)
  assert.equal(harness.controller.codeRequestStatus, "sent")
  assert.equal(harness.controller.busy, false)
})

test("editing the number returns to the phone step and resets code feedback", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  await harness.act((controller) => controller.handleCodeChange("12"))
  harness.events.length = 0

  await harness.act((controller) => controller.returnToPhoneStep())

  assert.equal(harness.controller.isCodeStep, false)
  assert.equal(harness.controller.flow.phoneNumber.replace(/\D/g, ""), VALID_TR_LOCAL)
  assert.equal(harness.controller.codeRequestStatus, "idle")
  assert.equal(harness.controller.smsNotice, null)
  assert.equal(harness.controller.resendCooldownSeconds, 0)
  assert.equal(harness.controller.termsAccepted, true)
  assert.deepEqual(harness.events, ["clear-error"])
  assert.deepEqual(harness.stageChanges, ["phone", "otp", "phone"])
})

test("typing clears a session error only when one is shown", async () => {
  const harness = mountController()
  harness.events.length = 0
  await harness.act((controller) => controller.handlePhoneChange("5"))
  assert.deepEqual(harness.events, [])

  harness.rerender({ errorMessage: "Provider error" })
  await harness.act((controller) => controller.handlePhoneChange("53"))
  assert.deepEqual(harness.events, ["clear-error"])

  harness.events.length = 0
  await harness.act((controller) => controller.handleCountrySelect("DE"))
  assert.deepEqual(harness.events, ["clear-error"], "changing country always clears the error")
  assert.equal(harness.controller.flow.selectedCountry, "DE")
})

test("a phone Firebase already verified completes the account without another code", async () => {
  const harness = mountController({}, { firebasePhoneNumber: VALID_TR_E164 })
  await enterValidPhone(harness)
  assert.equal(harness.controller.verifiedFirebasePhone, true)
  assert.equal(harness.controller.primaryDisabled, true, "create still requires the terms")

  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())

  assert.equal(harness.codeRequests.length, 0)
  assert.deepEqual(harness.registrations, [{
    phoneNumber: VALID_TR_E164,
    verificationCode: "",
    authIntent: "create",
    termsAcceptance: { version: LEGAL_DOCUMENT_VERSION, locale: "tr" }
  }])
})

test("Firebase phone changes are observed through the subscription", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  assert.equal(harness.controller.verifiedFirebasePhone, false)
  harness.firebase.listener?.(VALID_TR_E164)
  harness.rerender()
  assert.equal(harness.controller.verifiedFirebasePhone, true)
})

test("sign-in needs no legal acceptance, reports no create-flow stage, and submits the sign-in intent", async () => {
  const harness = mountController({ authIntent: "sign-in" })
  await enterValidPhone(harness)
  assert.equal(harness.controller.primaryDisabled, false)
  assert.equal(harness.controller.progressTotal, 2)
  assert.equal(harness.controller.progressCurrent, 1)

  await harness.act((controller) => controller.runPrimaryAction())
  assert.equal(harness.controller.progressCurrent, 2)
  await harness.act((controller) => controller.handleCodeChange("654321"))

  assert.deepEqual(harness.stageChanges, [])
  assert.deepEqual(harness.registrations, [{
    phoneNumber: VALID_TR_E164,
    verificationCode: "654321",
    authIntent: "sign-in",
    termsAcceptance: { version: LEGAL_DOCUMENT_VERSION, locale: "tr" }
  }])
})

test("an external submit keeps the primary action busy", () => {
  const harness = mountController({ authIntent: "sign-in", isSubmitting: true })
  assert.equal(harness.controller.busy, true)
  assert.equal(harness.controller.primaryDisabled, true)
})

test("the code request waits for the OTP step to commit, then the code field takes focus", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  harness.events.length = 0
  harness.controller.runPrimaryAction()
  await new Promise((resolveTurn) => setImmediate(resolveTurn))
  assert.deepEqual(harness.events, ["clear-error"], "no provider request before the OTP step renders")
  assert.equal(harness.otpFocusCalls.length, 0)
  await harness.act(() => undefined)
  assert.deepEqual(harness.events, ["clear-error", "request-code"])
  assert.equal(harness.otpFocusCalls.length, 1)
})

test("a rejected code buzzes, clears the cells, refocuses and is not resubmitted by itself", async () => {
  const harness = mountController()
  await enterValidPhone(harness)
  await harness.act((controller) => controller.toggleTermsAccepted())
  await harness.act((controller) => controller.runPrimaryAction())
  const focusBefore = harness.otpFocusCalls.length
  harness.setRegisterOutcome("reject")

  await harness.act((controller) => controller.handleCodeChange("111111"))
  assert.equal(harness.registrations.length, 1)
  assert.deepEqual(harness.haptics, ["error"])
  assert.equal(harness.controller.flow.verificationCode, "")
  assert.equal(harness.controller.otpErrorCount, 1)
  assert.equal(harness.controller.showOtpError, false, "the session error speaks, not the empty-code hint")
  assert.equal(harness.otpFocusCalls.length, focusBefore + 1)

  // Retyping the same code is a deliberate attempt and verifies again once.
  await harness.act((controller) => controller.handleCodeChange("111111"))
  assert.equal(harness.registrations.length, 1, "the identical failed code is not auto-resubmitted")
  await harness.act((controller) => controller.handleCodeChange("111112"))
  assert.equal(harness.registrations.length, 2)
})
