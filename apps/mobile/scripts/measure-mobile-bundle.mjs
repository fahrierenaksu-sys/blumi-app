import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const args = parseArgs(process.argv.slice(2))
const input = resolve(args.input)
const report = measureExport(input)

if (args.baseline) {
  const baseline = JSON.parse(readFileSync(resolve(args.baseline), "utf8"))
  const deltaBytes = report.totalBytes - baseline.totalBytes
  report.baselineBytes = baseline.totalBytes
  report.deltaBytes = deltaBytes
  report.maxDeltaBytes = baseline.maxDeltaBytes
  if (deltaBytes > baseline.maxDeltaBytes) {
    throw new Error(
      `Mobile bundle grew by ${deltaBytes} bytes; budget is ${baseline.maxDeltaBytes} bytes.`
    )
  }
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
if (args.output) writeFileSync(resolve(args.output), serialized)
process.stdout.write(serialized)

function measureExport(root) {
  const files = listFiles(root)
  const javascriptBytes = files
    .filter((file) => file.relative.startsWith("_expo/static/js/"))
    .reduce((total, file) => total + file.bytes, 0)
  const assetBytes = files
    .filter((file) => file.relative.startsWith("assets/"))
    .reduce((total, file) => total + file.bytes, 0)
  const metadataBytes = files
    .filter((file) => file.relative === "metadata.json")
    .reduce((total, file) => total + file.bytes, 0)
  return {
    platform: "ios",
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    javascriptBytes,
    assetBytes,
    metadataBytes,
    fileCount: files.length
  }
}

function listFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(current, entry.name)
    if (entry.isDirectory()) return listFiles(root, absolute)
    return [{
      relative: absolute.slice(`${root}/`.length),
      bytes: statSync(absolute).size
    }]
  })
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith("--")) throw new Error(`Unknown argument: ${value}`)
    const key = value.slice(2)
    const next = values[index + 1]
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`)
    parsed[key] = next
    index += 1
  }
  if (!parsed.input) throw new Error("--input is required")
  return parsed
}
