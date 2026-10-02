import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("navigation uses the patched decoder through a compatible query-string adapter", () => {
  const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"))
  const decoders = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/decode-uri-component"))
  assert.ok(decoders.length > 0)
  // CVE-2022-38900 is fixed from 0.2.2; any later release is fine.
  const atLeast = (version, floor) => {
    const a = version.split(".").map(Number), b = floor.split(".").map(Number)
    for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]
    return true
  }
  for (const [, pkg] of decoders) assert.ok(atLeast(pkg.version, "0.2.2"), pkg.version)
})

test("actual navigation parser retains deep links and bounds malformed input", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {getStateFromPath} from '@react-navigation/core';
    const config={screens:{Profile:'profile/:id'}};
    const result=getStateFromPath('/profile/alice?name=Blumi%20Test&tag=a&tag=b',config);
    assert.equal(result.routes[0].params.id,'alice');
    assert.equal(result.routes[0].params.name,'Blumi Test');
    assert.deepEqual(result.routes[0].params.tag,['a','b']);
    assert.ok(getStateFromPath('/profile/alice?q='+('%EA'.repeat(2000)),config));
  // The child cold-loads @react-navigation/core; 5 s timed out on a fresh
  // container (ETIMEDOUT, passes in ~1 s when warm). The assertions are unchanged.
  `], { cwd: new URL("../../", import.meta.url), encoding: "utf8", timeout: 30000 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})
