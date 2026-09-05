export type ProductEventPropertyValue = string | number | boolean | undefined
export type ProductEventProperties = Record<string, ProductEventPropertyValue>

const SENSITIVE_PROPERTY_KEY = /(?:^|_)(?:id|identifier|name|phone|email|message|body|url|uri|location|code|token)(?:_|$)/i
const MAX_PRODUCT_EVENT_PROPERTIES = 16

function isProductEventPropertyValue(value: unknown): value is Exclude<
  ProductEventPropertyValue,
  undefined
> {
  return (
    (typeof value === "string" && value.length <= 96) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  )
}

type Rule = readonly string[] | "metric" | "boolean"
const mode = ["production", "demo"] as const
const step = ["intro", "intro_world", "intro_scan", "intro_brand", "intro_character", "intro_characters", "intro_actions", "intro_complete", "account", "profile", "avatar", "room", "phone", "otp"] as const
const flow = ["auth_entry", "auth_entry_intro", "create_account", "create-account", "sign-in", "onboarding", "pre_auth"] as const
const onboarding = { step, flow, reduce_motion: "boolean", resumed: "boolean", elapsed_ms: "metric" } as const
const schemas: Readonly<Record<string, Readonly<Record<string, Rule>>>> = {
  onboarding_step_viewed: onboarding,
  onboarding_step_completed: onboarding,
  onboarding_intro_performance: { ...onboarding, cold_start_ms: "metric", js_mount_ms: "metric", intro_visible_ms: "metric", intro_frame_samples: "metric", intro_slow_frames: "metric", intro_severe_frames: "metric", intro_worst_frame_ms: "metric", intro_average_frame_ms: "metric" },
  activation_session_started: { mode, lifecycle: ["returning", "onboarding"] },
  engagement_app_foregrounded: { mode },
  activation_first_discovery_decision: { mode, decision: ["like", "pass"] },
  activation_first_room_change: { mode },
  discovery_decision: { mode, decision: ["like", "pass"] },
  match_created: { mode, source: ["mini_room_mutual_save", "discovery"] },
  chat_message_sent: { mode, kind: ["text"] },
  room_invite_sent: { mode }, room_invite_accepted: { mode },
  room_invite_declined: { mode }, room_invite_cancelled: { mode }, room_joined: { mode },
  safety_action_completed: { mode, action: ["block", "report", "report_and_block"] },
  purchase_completed: { item_type: ["avatar", "room", "coins"], price_coins: "metric" },
  purchase_failed: { item_type: ["avatar", "room", "coins"], stage: ["revenuecat_identity_sync"] },
  wardrobe_item_equipped: {
    item_type: ["body", "face", "eyes", "nose", "mouth", "hair", "top", "bottom", "shoes", "accessory", "outfit"],
    full_look: "boolean"
  },
  referral_link_opened: { source: ["initial_url", "app_link"] },
  referral_share_sheet_opened: {}, referral_share_sheet_resolved: {},
  referral_attribution_submitted: { source: ["deep_link"] }
}

/** Unknown events/fields and arbitrary strings never cross the telemetry boundary. */
export function sanitizeNamedProductEventProperties(
  event: string, properties: Readonly<Record<string, unknown>>
): Record<string, Exclude<ProductEventPropertyValue, undefined>> {
  const schema = Object.hasOwn(schemas, event) ? schemas[event] : {}
  return Object.fromEntries(Object.entries(sanitizeProductEventProperties(properties)).filter(([key, value]) => {
    if (!Object.hasOwn(schema, key)) return false
    const rule = schema[key]
    if (rule === "metric") return typeof value === "number" && value >= 0 && value <= 1_000_000_000
    if (rule === "boolean") return typeof value === "boolean"
    return typeof value === "string" && rule.includes(value)
  }))
}

function normalizePropertyKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
}

/**
 * Product events are aggregate funnel signals, never a transport for identity,
 * content, invite links, or other user-provided data.
 */
export function sanitizeProductEventProperties(
  properties: Readonly<Record<string, unknown>>
): Record<string, Exclude<ProductEventPropertyValue, undefined>> {
  const safeEntries = Object.entries(properties).filter(
    ([key, value]) =>
      !SENSITIVE_PROPERTY_KEY.test(normalizePropertyKey(key)) &&
      isProductEventPropertyValue(value)
  ).slice(0, MAX_PRODUCT_EVENT_PROPERTIES)
  return Object.fromEntries(safeEntries) as Record<
    string,
    Exclude<ProductEventPropertyValue, undefined>
  >
}
