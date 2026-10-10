import { build } from "esbuild"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const output = resolve(import.meta.dirname, "functions")
await mkdir(resolve(output, "lib"), { recursive: true })
await build({
  entryPoints: [resolve(root, "apps/server/src/auth/firebaseSmsAdmission.ts")],
  outfile: resolve(output, "lib/admission.mjs"), bundle: true,
  platform: "node", target: "node22", format: "esm", packages: "external"
})
for (const [source, name] of [["firebaseSmsDeviceGate", "device-gate"], ["firebaseSmsDeviceProof", "device-proof"]]) {
  await build({
    entryPoints: [resolve(root, `apps/server/src/auth/${source}.ts`)],
    outfile: resolve(output, `lib/${name}.mjs`), bundle: true,
    platform: "node", target: "node22", format: "esm", packages: "external"
  })
}
const migration = "072_firebase_sms_admission.sql"
const bytes = await readFile(resolve(root, "apps/server/db/migrations", migration))
await writeFile(resolve(output, "schema-lock.json"), JSON.stringify({
  migration, checksum: createHash("sha256").update(bytes).digest("hex")
}, null, 2) + "\n")
