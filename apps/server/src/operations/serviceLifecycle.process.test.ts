import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { once } from "node:events"
import { request } from "node:http"
import test from "node:test"

function waitForChildMessage(
  child: ReturnType<typeof fork>,
  messages: unknown[],
  predicate: (message: unknown) => boolean,
  label: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown) => {
      if (!predicate(message)) return
      cleanup()
      resolve(message)
    }
    const onExit = () => {
      cleanup()
      reject(new Error(`Child exited before lifecycle message: ${label}; received=${JSON.stringify(messages)}`))
    }
    const cleanup = () => {
      child.off("message", onMessage)
      child.off("exit", onExit)
    }
    child.on("message", onMessage)
    child.once("exit", onExit)
    const existing = messages.find(predicate)
    if (existing !== undefined) {
      cleanup()
      resolve(existing)
    }
  })
}

test("SIGTERM drains an active HTTP request and worker before database close", { timeout: 5000 }, async () => {
  const lifecycleModulePath = require.resolve("./serviceLifecycle")
  const child = fork("", [], {
    execArgv: ["--import", "tsx", "--input-type=module", "--eval", `
      import {createServer} from 'node:http';
      import {createGracefulShutdown} from ${JSON.stringify(lifecycleModulePath)};
      let release;
      const pending = new Promise(resolve => { release = resolve });
      const server = createServer(async (_req,res) => {
        process.send('request-started');
        await pending;
        res.end('finished');
      });
      const stop = createGracefulShutdown({
        markNotReady(){process.send('not-ready')},
        drain:[()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),()=>pending],
        async closeData(){process.send('database-closed')}
      });
      process.on('message',message=>{if(message==='release')release()});
      process.once('SIGTERM',()=>void stop().then(()=>process.exit(0),()=>process.exit(1)));
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
    `], silent: true
  })
  const messages: unknown[] = []
  child.on("message", (message) => messages.push(message))
  child.stderr?.on("data", (chunk) => messages.push({ stderr: String(chunk) }))
  try {
    const address = await waitForChildMessage(
      child,
      messages,
      (message): message is { port: number } =>
        typeof message === "object" && message !== null && "port" in message,
      "listening address"
    ) as { port: number }
    const response = new Promise<string>((resolve, reject) => {
      const outgoing = request({ host: "127.0.0.1", port: address.port, agent: false }, (incoming) => {
        let body = ""
        incoming.on("data", (chunk) => { body += chunk })
        incoming.on("end", () => resolve(body))
      })
      outgoing.on("error", reject)
      outgoing.end()
    })
    await waitForChildMessage(child, messages, (message) => message === "request-started", "request-started")
    const exit = once(child, "exit")
    child.kill("SIGTERM")
    await waitForChildMessage(child, messages, (message) => message === "not-ready", "not-ready")
    assert.ok(messages.includes("not-ready"))
    assert.equal(messages.includes("database-closed"), false)
    child.send("release")
    assert.equal(await response, "finished")
    assert.deepEqual(await exit, [0, null])
    assert.ok(messages.includes("database-closed"))
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL")
  }
})
