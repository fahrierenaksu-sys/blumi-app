import { RealtimeTicketRequestError } from "./realtimeClient"

export async function requestRealtimeTicket(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const base = baseHttpUrl.endsWith("/")
    ? baseHttpUrl.slice(0, -1)
    : baseHttpUrl
  const response = await fetcher(`${base}/v1/auth/realtime-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  })
  if (!response.ok) throw new RealtimeTicketRequestError(response.status)

  const payload: unknown = await response.json()
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null
  const ticket = typeof record?.ticket === "string" ? record.ticket : ""
  if (
    !/^[A-Za-z0-9_-]{8,128}$/.test(ticket) ||
    !isIsoDate(record?.expiresAt) ||
    (record !== null && Object.hasOwn(record, "sessionToken"))
  ) {
    throw new Error("Blumi received an invalid realtime ticket.")
  }
  return ticket
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
}
