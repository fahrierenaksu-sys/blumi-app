import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { once } from "node:events"
import test from "node:test"

function runChild(fault: string) {
  const lifecycleModulePath = require.resolve("./processLifecycle")
  const child = fork("", [], {
    execArgv: ["--import", "tsx", "--input-type=module", "--eval", `
      import {installProcessLifecycle} from ${JSON.stringify(lifecycleModulePath)};
      installProcessLifecycle({
        process,
        shutdown: async () => { process.send('drained') },
        exit: (code) => process.exit(code),
        reportError: (message, kind) => console.error(message, kind)
      });
      setTimeout(() => { ${fault} }, 0);
      setInterval(() => {}, 1000);
    `], silent: true
  })
  const messages: unknown[] = []
  let stderr = ""
  child.on("message", (message) => messages.push(message))
  child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
  return { child, messages, stderr: () => stderr }
}

for (const [label, fault] of [
  ["unhandled rejection", "Promise.reject(new Error('private body +15550000000'))"],
  ["uncaught exception", "throw new Error('private body +15550000000')"]
] as const) {
  test(`a real ${label} drains, exits 1 and keeps its message out of stderr`, { timeout: 10_000 }, async () => {
    const { child, messages, stderr } = runChild(fault)
    try {
      const [code] = await once(child, "exit")
      assert.equal(code, 1)
      assert.deepEqual(messages, ["drained"])
      assert.match(stderr(), /Blumi process fault/)
      assert.equal(stderr().includes("private body"), false)
      assert.equal(stderr().includes("+15550000000"), false)
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL")
    }
  })
}
