import assert from "node:assert/strict"
import test from "node:test"
import { createAfterResponseTasks } from "./afterResponseTasks"

test("after-response tasks run without blocking the caller, drain waits for chained work, and failures report only a kind", async () => {
  const reports: Array<{ kind: string; error: unknown }> = []
  const tasks = createAfterResponseTasks({ reportFailure: (kind, error) => reports.push({ kind, error }) })
  const order: string[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  tasks.run("announce", async () => {
    await gate
    order.push("announce")
    tasks.run("follow-up", async () => { order.push("follow-up") })
  })
  tasks.run("push", async () => { throw new Error("push queue down for +905551112233") })
  order.push("answered")
  release()
  await tasks.drain()
  assert.deepEqual(order, ["answered", "announce", "follow-up"])
  assert.deepEqual(reports.map((report) => report.kind), ["push"])
  await tasks.drain()
})
