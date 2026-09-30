import { isRootRouteName, type RootRouteName } from "../navigation/rootRouteNames"

const errorTypes = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"])
const levels = new Set(["debug", "info", "warning", "error", "fatal", "log"])
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function safePosition(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function canonicalCodeFile(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const clean = value.split(/[?#]/, 1)[0] ?? ""
  const name = clean.split("/").at(-1) ?? ""
  if (/^(?:index(?:\.(?:android|ios))?\.bundle|(?:main|index)\.jsbundle|(?:entry|bundle)\.js|[a-f0-9]{16,64}\.js)$/.test(name)) return `app:///${name}`
  const source = clean.match(/(?:^|\/)(apps\/mobile\/src\/[A-Za-z0-9_./-]+\.(?:tsx?|jsx?))$/)?.[1]
  return source && !source.includes("..") ? `app:///${source}` : undefined
}
export type CrashBoundaryScope = "root" | "route"
export type ReportableRouteName = RootRouteName | "unknown"
/** The only tags a crash report may carry; every other tag is stripped. */
export interface CrashReportTags {
  boundary: CrashBoundaryScope
  route?: ReportableRouteName
}

/** Only a typed root stack route name is reportable; anything else is "unknown". */
export function toReportableRouteName(value: unknown): ReportableRouteName {
  return isRootRouteName(value) ? value : "unknown"
}

const ownValue = (source: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined

/** Keeps `boundary` (root|route) and an allowlisted `route`; drops every other tag. */
function sanitizeTags(input: unknown): Partial<CrashReportTags> {
  const tags = record(input)
  const boundary = ownValue(tags, "boundary")
  const route = ownValue(tags, "route")
  return {
    ...(boundary === "root" || boundary === "route" ? { boundary } : {}),
    ...(typeof route === "string" ? { route: toReportableRouteName(route) } : {})
  }
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** Free-form exception text, breadcrumbs and nested contexts may contain chat/OTP data. */
export function sanitizeCrashEvent(input: unknown) {
  const event = record(input)
  const exception = record(event.exception)
  const images = record(event.debug_meta).images
  const tags = sanitizeTags(event.tags)
  return {
    ...(event.platform === "javascript" ? { platform: "javascript" } : {}),
    ...(typeof event.environment === "string" && ["development", "preview", "production"].includes(event.environment) ? { environment: event.environment } : {}),
    ...(typeof event.release === "string" && /^(?:com\.blumi\.mobile@|blumi@)?\d+\.\d+\.\d+(?:[+.-][A-Za-z0-9.-]+)?$/.test(event.release) ? { release: event.release } : {}),
    ...(typeof event.dist === "string" && /^\d{1,12}$/.test(event.dist) ? { dist: event.dist } : {}),
    ...(Array.isArray(images) ? { debug_meta: { images: images.slice(0, 20).flatMap((value) => {
      const item = record(value)
      const codeFile = canonicalCodeFile(item.code_file)
      return item.type === "sourcemap" && typeof item.debug_id === "string" && uuid.test(item.debug_id) && codeFile
        ? [{ type: "sourcemap", debug_id: item.debug_id, code_file: codeFile }] : []
    }) } } : {}),
    ...(typeof event.event_id === "string" && /^[a-f0-9]{1,32}$/i.test(event.event_id) ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === "number" && Number.isFinite(event.timestamp) ? { timestamp: event.timestamp } : {}),
    ...(typeof event.level === "string" && levels.has(event.level) ? { level: event.level } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    ...(Array.isArray(exception.values) ? { exception: { values: exception.values.slice(0, 5).map((value) => {
      const item = record(value)
      const stack = record(item.stacktrace)
      return {
        type: typeof item.type === "string" && errorTypes.has(item.type) ? item.type : "Error",
        value: "[redacted]",
        stacktrace: { frames: (Array.isArray(stack.frames) ? stack.frames : []).slice(-50).map((value) => {
          const frame = record(value)
          const filename = canonicalCodeFile(frame.filename)
          const absPath = canonicalCodeFile(frame.abs_path)
          return {
            ...(filename ? { filename } : {}),
            ...(absPath ? { abs_path: absPath } : {}),
            ...(typeof frame.function === "string" && /^[A-Za-z_$][\w.$<>]{0,119}$/.test(frame.function) ? { function: frame.function } : {}),
            ...(safePosition(frame.lineno) ? { lineno: frame.lineno } : {}),
            ...(safePosition(frame.colno) ? { colno: frame.colno } : {}),
            ...(typeof frame.in_app === "boolean" ? { in_app: frame.in_app } : {})
          }
        }) }
      }
    }) } } : {})
  }
}
