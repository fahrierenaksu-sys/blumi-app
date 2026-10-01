// Worker threads do not inherit the parent's tsx loader; register it here so
// worker entry points can import TypeScript sources with extensionless paths.
import { register } from "tsx/esm/api"
import { workerData } from "node:worker_threads"

register()
await import(workerData.entry)
