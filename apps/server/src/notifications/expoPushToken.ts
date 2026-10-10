/** Expo's SDK accepts both bracket prefixes and legacy UUID-shaped tokens. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4096 && (
    /^(?:ExponentPushToken|ExpoPushToken)\[[^\[\]\s\x00-\x1f\x7f]+\]$/.test(value) ||
    /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(value)
  )
}
