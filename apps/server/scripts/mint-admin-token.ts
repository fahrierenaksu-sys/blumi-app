import { randomUUID } from "node:crypto"
import { resolveServerConfig } from "../src/config"
import {
  ADMIN_SCOPES,
  mintAdminToken,
  type AdminScope
} from "../src/admin/adminTokenService"

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...value] = argument.split("=")
    return [name, value.join("=")]
  })
)
const operatorId = args.get("--subject")?.trim()
const requestedScopes = args.get("--scopes")?.split(",").filter(Boolean) ?? []
const ttlSeconds = Number(args.get("--ttl") ?? 600)

if (!operatorId) throw new Error("Use --subject=operator-id.")
if (
  requestedScopes.length === 0 ||
  !requestedScopes.every((scope) => ADMIN_SCOPES.includes(scope as AdminScope))
) throw new Error("Use --scopes=reports:read and/or reports:resolve.")

const config = resolveServerConfig()
const key = config.adminSigningKeys.find(
  (candidate) => candidate.keyId === config.adminActiveKeyId
)
if (!key) throw new Error("Configure an active admin signing key first.")

process.stdout.write(`${mintAdminToken({
  key,
  operatorId,
  tokenId: randomUUID(),
  scopes: requestedScopes as AdminScope[],
  ttlSeconds
})}\n`)
