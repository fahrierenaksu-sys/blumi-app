import { readFileSync } from "node:fs"
import { X509Certificate } from "node:crypto"
import pg from "pg"

// Supabase's published Root 2021 CA; hostname verification remains enabled.
const ca = readFileSync(new URL("./supabase-root-2021.crt", import.meta.url), "utf8")
if (new X509Certificate(ca).fingerprint256 !==
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA") {
  throw new Error("Unexpected database certificate authority")
}

export function databasePoolOptions(raw) {
  const url = new URL(raw)
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
    ["ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"].some(key => url.searchParams.has(key)) ||
    (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "verify-full")) {
    throw new Error("Verified database TLS is required")
  }
  url.searchParams.delete("sslmode")
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca },
    max: 1, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10_000, query_timeout: 3000 }
}

export const createDatabasePool = raw => new pg.Pool(databasePoolOptions(raw))
