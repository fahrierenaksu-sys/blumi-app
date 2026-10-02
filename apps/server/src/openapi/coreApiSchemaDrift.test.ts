import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import { z } from "zod"
import {
  accountConfirmationRequestSchema,
  accountRecoveryRequestSchema,
  authPhoneRequestSchema,
  authVerificationRequestSchema,
  blockUserRequestSchema,
  chatPreferencesUpdateRequestSchema,
  commerceReconcileRequestSchema,
  connectionDecisionRequestSchema,
  coreApiJsonSchemas,
  createThreadRequestSchema,
  deviceRegistrationRequestSchema,
  deviceRemovalRequestSchema,
  discoverDeckQuerySchema,
  discoverProfileParamsSchema,
  listChatMessagesQuerySchema,
  markThreadReadRequestSchema,
  hideChatThreadRequestSchema,
  notificationPreferencesPatchSchema,
  onboardingStepRequestSchema,
  personalRoomDecorSaveRequestSchema,
  phoneChangeConfirmRequestSchema,
  phoneChangeNewChallengeRequestSchema,
  phoneNumberRequestSchema,
  registerAccountRequestSchema,
  reportUserRequestSchema,
  revenueCatWebhookRequestSchema,
  roomInviteDecisionRequestSchema,
  sendChatMessageRequestSchema,
  verificationCodeRequestSchema
} from "@blumi/contracts"

type JsonSchemaName = keyof typeof coreApiJsonSchemas
type RequestPart = "body" | "querystring" | "params"

interface SchemaPair {
  json: JsonSchemaName
  zod: z.ZodTypeAny
  part: RequestPart
  valid: Record<string, unknown>
}

/**
 * Every zod parser in CoreApiSchemas.ts and the JSON Schema Fastify validates
 * the same request part with. A new shared schema must be added here.
 */
const PAIRS: SchemaPair[] = [
  {
    json: "connectionDecision",
    zod: connectionDecisionRequestSchema,
    part: "body",
    valid: { miniRoomId: "room_1", partnerUserId: "user_2", status: "saved" }
  },
  { json: "blockUser", zod: blockUserRequestSchema, part: "body", valid: { blockedUserId: "user_2" } },
  {
    json: "reportUser",
    zod: reportUserRequestSchema,
    part: "body",
    valid: { reportedUserId: "user_2", reason: "spam", note: "details" }
  },
  {
    json: "notificationPreferences",
    zod: notificationPreferencesPatchSchema,
    part: "body",
    valid: {
      likesEnabled: true,
      messagesEnabled: false,
      matchesEnabled: true,
      discoveryWatchEnabled: false,
      quietHours: { startMinute: 1320, endMinute: 420 },
      quietHoursUtcOffsetMinutes: 180,
      quietHoursTimeZone: "Europe/Istanbul",
      maxPushesPerHour: 4
    }
  },
  {
    json: "deviceRegistration",
    zod: deviceRegistrationRequestSchema,
    part: "body",
    valid: { platform: "ios", pushToken: "ExponentPushToken[abc]" }
  },
  { json: "deviceRemoval", zod: deviceRemovalRequestSchema, part: "body", valid: { pushToken: "ExponentPushToken[abc]" } },
  {
    json: "personalRoomDecorSave",
    zod: personalRoomDecorSaveRequestSchema,
    part: "body",
    valid: { expectedRevision: 0, decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] } }
  },
  { json: "createThread", zod: createThreadRequestSchema, part: "body", valid: { participantUserIds: ["user_1", "user_2"] } },
  { json: "sendChatMessage", zod: sendChatMessageRequestSchema, part: "body", valid: { body: "Hello", clientMessageId: "c1" } },
  { json: "listChatMessagesQuery", zod: listChatMessagesQuerySchema, part: "querystring", valid: { before: "m1", limit: "30" } },
  { json: "markThreadRead", zod: markThreadReadRequestSchema, part: "body", valid: { upToMessageId: "message_1" } },
  { json: "hideChatThread", zod: hideChatThreadRequestSchema, part: "body", valid: { throughMessageId: "message_1" } },
  { json: "chatPreferences", zod: chatPreferencesUpdateRequestSchema, part: "body", valid: { readReceiptsEnabled: true } },
  { json: "roomInviteDecision", zod: roomInviteDecisionRequestSchema, part: "body", valid: { status: "accepted" } },
  {
    json: "accountConfirmation",
    zod: accountConfirmationRequestSchema,
    part: "body",
    valid: { confirmationToken: "dv_token" }
  },
  { json: "verificationCode", zod: verificationCodeRequestSchema, part: "body", valid: { verificationCode: "482931" } },
  { json: "onboardingStep", zod: onboardingStepRequestSchema, part: "body", valid: { step: "avatar" } },
  { json: "phoneNumber", zod: phoneNumberRequestSchema, part: "body", valid: { phoneNumber: "+905551112233" } },
  {
    json: "phoneChangeNewChallenge",
    zod: phoneChangeNewChallengeRequestSchema,
    part: "body",
    valid: { phoneNumber: "+905551112233", currentPhoneConfirmationToken: "dv_token" }
  },
  {
    json: "phoneChangeConfirm",
    zod: phoneChangeConfirmRequestSchema,
    part: "body",
    valid: { currentPhoneConfirmationToken: "dv_a", newPhoneConfirmationToken: "dv_b" }
  },
  {
    json: "accountRecoveryRequest",
    zod: accountRecoveryRequestSchema,
    part: "body",
    valid: { oldPhoneNumber: "+905551112233", newPhoneNumber: "+905559998877", idToken: "token" }
  },
  { json: "authPhone", zod: authPhoneRequestSchema, part: "body", valid: { phoneNumber: "+905551112233" } },
  {
    json: "authVerification",
    zod: authVerificationRequestSchema,
    part: "body",
    valid: { phoneNumber: "+905551112233", verificationCode: "482931" }
  },
  {
    json: "registerAccount",
    zod: registerAccountRequestSchema,
    part: "body",
    valid: {
      phoneNumber: "+905551112233",
      verificationCode: "482931",
      termsAcceptance: { version: "2026-09-01", locale: "en" }
    }
  },
  { json: "commerceReconcile", zod: commerceReconcileRequestSchema, part: "body", valid: { transactionIds: ["t1", "t2"] } },
  { json: "revenueCatWebhook", zod: revenueCatWebhookRequestSchema, part: "body", valid: { event: { type: "TEST" } } },
  { json: "discoverProfileParams", zod: discoverProfileParamsSchema, part: "params", valid: { userId: "user_2" } },
  {
    json: "discoverDeckQuery",
    zod: discoverDeckQuerySchema,
    part: "querystring",
    valid: { ageMin: "18", ageMax: "40", gender: ["woman", "man"], vibe: "coffee", cursor: "abc", limit: "12" }
  }
]

/**
 * Reviewed, intentional differences between a zod parser and its JSON Schema.
 * Anything not listed here is drift and fails the test.
 */
const KNOWN_DIFFERENCES: Partial<Record<JsonSchemaName, string[]>> = {
  // Uniqueness is a zod refine() on the object; JSON Schema says uniqueItems.
  // The behavioural corpus below proves both reject duplicates.
  commerceReconcile: ["$.transactionIds.unique: json=true zod=undefined"]
}

type Descriptor =
  | { kind: "string"; enum?: string[]; min?: number; max?: number; pattern?: string; nonBlank?: true }
  | { kind: "integer" | "number"; min?: number }
  | { kind: "boolean" | "null" | "unknown" }
  | { kind: "array"; items: Descriptor; min?: number; max?: number; unique?: true }
  | { kind: "object"; properties: Record<string, { required: boolean; schema: Descriptor }> }
  | { kind: "anyOf"; options: Descriptor[] }

test("shared zod parsers and JSON Schemas describe the same request contract", () => {
  const covered = new Set(PAIRS.map((pair) => pair.json))
  const uncovered = (Object.keys(coreApiJsonSchemas) as JsonSchemaName[])
    // `object` and `pathId` are generic fragments without a zod twin.
    .filter((name) => !covered.has(name) && name !== "object" && name !== "pathId")
  assert.deepEqual(uncovered, [], "every shared JSON Schema needs a zod twin in PAIRS")

  const drift: Record<string, string[]> = {}
  for (const pair of PAIRS) {
    const differences: string[] = []
    compareDescriptors(
      "$",
      describeJson(coreApiJsonSchemas[pair.json]),
      describeZod(pair.zod),
      differences
    )
    const known = KNOWN_DIFFERENCES[pair.json] ?? []
    if (JSON.stringify(differences) !== JSON.stringify(known)) drift[pair.json] = differences
  }
  assert.deepEqual(drift, {}, "shared request schemas drifted")
})

test("Fastify's validator and the zod parser accept and reject the same requests", async () => {
  const disagreements: string[] = []
  for (const pair of PAIRS) {
    const app = Fastify()
    app.route({
      method: pair.part === "body" ? "POST" : "GET",
      url: pair.part === "params" ? "/probe/:userId" : "/probe",
      attachValidation: true,
      schema: { [pair.part]: coreApiJsonSchemas[pair.json] },
      handler: async (request) => {
        const value = pair.part === "body"
          ? request.body
          : pair.part === "params"
            ? request.params
            : request.query
        return {
          schemaOk: !request.validationError,
          zodOk: pair.zod.safeParse(value).success
        }
      }
    })
    try {
      for (const [label, input] of createCorpus(pair)) {
        const response = await app.inject(toInjectOptions(pair.part, input))
        assert.equal(response.statusCode, 200, `${pair.json} ${label}`)
        const result = response.json() as { schemaOk: boolean; zodOk: boolean }
        if (result.schemaOk !== result.zodOk || (label === "valid" && !result.schemaOk)) {
          disagreements.push(`${pair.json} ${label}: schema=${result.schemaOk} zod=${result.zodOk}`)
        }
      }
    } finally {
      await app.close()
    }
  }
  assert.deepEqual(disagreements, [])
})

function createCorpus(pair: SchemaPair): Array<[string, Record<string, unknown>]> {
  const corpus: Array<[string, Record<string, unknown>]> = [["valid", pair.valid]]
  const json = coreApiJsonSchemas[pair.json] as { required?: readonly string[]; properties?: Record<string, unknown> }
  for (const key of json.required ?? []) {
    const { [key]: _removed, ...rest } = pair.valid
    corpus.push([`missing ${key}`, rest])
  }
  for (const key of Object.keys(json.properties ?? {})) {
    if (pair.part === "body") {
      corpus.push([`${key} as object`, { ...pair.valid, [key]: { unexpected: true } }])
      corpus.push([`${key} as number`, { ...pair.valid, [key]: 7 }])
    }
    corpus.push([`${key} blank`, { ...pair.valid, [key]: " " }])
    corpus.push([`${key} empty`, { ...pair.valid, [key]: "" }])
  }
  if (pair.json === "commerceReconcile") {
    corpus.push(["duplicate transaction", { transactionIds: ["t1", "t1"] }])
    corpus.push(["too many transactions", { transactionIds: Array.from({ length: 11 }, (_, i) => `t${i}`) }])
  }
  if (pair.json === "createThread") {
    corpus.push(["three participants", { participantUserIds: ["a", "b", "c"] }])
  }
  if (pair.json === "personalRoomDecorSave") {
    corpus.push(["decor array", { expectedRevision: 0, decor: [] }])
    corpus.push(["negative revision", { expectedRevision: -1, decor: {} }])
  }
  if (pair.json === "discoverDeckQuery") {
    corpus.push(["fractional age", { ageMin: "18.5" }])
    corpus.push(["long cursor", { cursor: "c".repeat(516) }])
  }
  return corpus
}

function toInjectOptions(part: RequestPart, input: Record<string, unknown>) {
  if (part === "body") return { method: "POST" as const, url: "/probe", payload: input }
  if (part === "params") {
    const userId = typeof input.userId === "string" ? input.userId : ""
    return { method: "GET" as const, url: `/probe/${encodeURIComponent(userId)}` }
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    for (const entry of [value].flat()) {
      query.append(key, typeof entry === "string" ? entry : JSON.stringify(entry))
    }
  }
  return { method: "GET" as const, url: `/probe?${query.toString()}` }
}

function describeJson(schema: unknown): Descriptor {
  const node = schema as Record<string, unknown>
  if (Array.isArray(node.anyOf)) {
    return { kind: "anyOf", options: sortOptions(node.anyOf.map(describeJson)) }
  }
  switch (node.type) {
    case "string": {
      const descriptor: Extract<Descriptor, { kind: "string" }> = { kind: "string" }
      if (Array.isArray(node.enum)) descriptor.enum = [...node.enum as string[]].sort()
      if (node.pattern === "\\S" && node.minLength === 1) {
        descriptor.nonBlank = true
      } else {
        if (typeof node.minLength === "number") descriptor.min = node.minLength
        if (typeof node.pattern === "string") descriptor.pattern = node.pattern
      }
      if (typeof node.maxLength === "number") descriptor.max = node.maxLength
      return descriptor
    }
    case "integer":
    case "number":
      return typeof node.minimum === "number"
        ? { kind: node.type, min: node.minimum }
        : { kind: node.type }
    case "boolean":
      return { kind: "boolean" }
    case "null":
      return { kind: "null" }
    case "array": {
      const descriptor: Extract<Descriptor, { kind: "array" }> = {
        kind: "array",
        items: describeJson(node.items)
      }
      if (typeof node.minItems === "number") descriptor.min = node.minItems
      if (typeof node.maxItems === "number") descriptor.max = node.maxItems
      if (node.uniqueItems === true) descriptor.unique = true
      return descriptor
    }
    case "object": {
      const required = new Set((node.required as string[] | undefined) ?? [])
      const properties = (node.properties as Record<string, unknown> | undefined) ?? {}
      return {
        kind: "object",
        properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [
          key,
          { required: required.has(key), schema: describeJson(value) }
        ]))
      }
    }
    default:
      throw new Error(`Unsupported JSON Schema node: ${JSON.stringify(node)}`)
  }
}

function describeZod(schema: z.ZodTypeAny): Descriptor {
  if (schema instanceof z.ZodEffects) return describeZod(schema.innerType())
  if (schema instanceof z.ZodOptional) return describeZod(schema.unwrap())
  if (schema instanceof z.ZodNullable) {
    return { kind: "anyOf", options: sortOptions([describeZod(schema.unwrap()), { kind: "null" }]) }
  }
  if (schema instanceof z.ZodUnion) {
    return {
      kind: "anyOf",
      options: sortOptions((schema.options as z.ZodTypeAny[]).map(describeZod))
    }
  }
  if (schema instanceof z.ZodEnum) {
    return { kind: "string", enum: [...(schema.options as string[])].sort() }
  }
  if (schema instanceof z.ZodString) {
    const descriptor: Extract<Descriptor, { kind: "string" }> = { kind: "string" }
    const checks = schema._def.checks
    const trims = checks.some((check) => check.kind === "trim")
    for (const check of checks) {
      if (check.kind === "min") {
        if (trims && check.value === 1) descriptor.nonBlank = true
        else descriptor.min = check.value
      }
      if (check.kind === "max") descriptor.max = check.value
      if (check.kind === "regex") descriptor.pattern = check.regex.source
    }
    return descriptor
  }
  if (schema instanceof z.ZodNumber) {
    const isInteger = schema._def.checks.some((check) => check.kind === "int")
    const min = schema._def.checks.find((check) => check.kind === "min")
    const kind = isInteger ? "integer" as const : "number" as const
    return min && min.kind === "min" ? { kind, min: min.value } : { kind }
  }
  if (schema instanceof z.ZodBoolean) return { kind: "boolean" }
  if (schema instanceof z.ZodUnknown) return { kind: "unknown" }
  if (schema instanceof z.ZodRecord) return { kind: "object", properties: {} }
  if (schema instanceof z.ZodArray) {
    const descriptor: Extract<Descriptor, { kind: "array" }> = {
      kind: "array",
      items: describeZod(schema.element)
    }
    if (schema._def.minLength) descriptor.min = schema._def.minLength.value
    if (schema._def.maxLength) descriptor.max = schema._def.maxLength.value
    if (schema._def.exactLength) {
      descriptor.min = schema._def.exactLength.value
      descriptor.max = schema._def.exactLength.value
    }
    return descriptor
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    return {
      kind: "object",
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [
        key,
        { required: !value.isOptional(), schema: describeZod(value) }
      ]))
    }
  }
  throw new Error(`Unsupported zod node: ${schema.constructor.name}`)
}

function compareDescriptors(
  path: string,
  json: Descriptor,
  zod: Descriptor,
  differences: string[]
) {
  if (json.kind !== zod.kind) {
    differences.push(`${path}.kind: json=${json.kind} zod=${zod.kind}`)
    return
  }
  if (json.kind === "object" && zod.kind === "object") {
    const keys = new Set([...Object.keys(json.properties), ...Object.keys(zod.properties)])
    for (const key of [...keys].sort()) {
      const left = json.properties[key]
      const right = zod.properties[key]
      if (!left || !right) {
        differences.push(`${path}.${key}: json=${left ? "present" : "missing"} zod=${right ? "present" : "missing"}`)
        continue
      }
      if (left.required !== right.required) {
        differences.push(`${path}.${key}.required: json=${left.required} zod=${right.required}`)
      }
      compareDescriptors(`${path}.${key}`, left.schema, right.schema, differences)
    }
    return
  }
  if (json.kind === "array" && zod.kind === "array") {
    compareDescriptors(`${path}[]`, json.items, zod.items, differences)
    for (const key of ["min", "max", "unique"] as const) {
      if (json[key] !== zod[key]) differences.push(`${path}.${key}: json=${json[key]} zod=${zod[key]}`)
    }
    return
  }
  if (json.kind === "anyOf" && zod.kind === "anyOf") {
    if (json.options.length !== zod.options.length) {
      differences.push(`${path}.anyOf: json=${json.options.length} zod=${zod.options.length}`)
      return
    }
    json.options.forEach((option, index) => {
      compareDescriptors(`${path}|${index}`, option, zod.options[index]!, differences)
    })
    return
  }
  const left = canonicalJson(json)
  const right = canonicalJson(zod)
  if (left !== right) differences.push(`${path}: json=${left} zod=${right}`)
}

function canonicalJson(value: object): string {
  return JSON.stringify(value, Object.keys(value).sort())
}

function sortOptions(options: Descriptor[]): Descriptor[] {
  return [...options].sort((left, right) => left.kind.localeCompare(right.kind))
}
