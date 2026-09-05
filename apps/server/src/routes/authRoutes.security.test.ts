import assert from "node:assert/strict"
import test from "node:test"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createServer } from "../server"

test("authentication routes never write phone numbers or OTP codes to process logs", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const app = createServer({ authService })
  const captured: unknown[][] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => {
    captured.push(args)
  }
  console.error = (...args: unknown[]) => {
    captured.push(args)
  }

  try {
    await app.inject({
      method: "POST",
      url: "/v1/auth/send-code",
      payload: { phoneNumber: "+905551112233" }
    })
    await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: {
        phoneNumber: "+905551112233",
        verificationCode: "482931"
      }
    })
  } finally {
    console.log = originalLog
    console.error = originalError
    await app.close()
  }

  const serializedLogs = JSON.stringify(captured)
  assert.doesNotMatch(serializedLogs, /\+905551112233/)
  assert.doesNotMatch(serializedLogs, /482931/)
})
