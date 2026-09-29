import { requestJson } from "../network/apiClient"
import { parseReferralCodeFromUrl } from "./referralModel"

export async function createReferralInvite(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch
): Promise<{ url: string }> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/referrals/invite", {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  }, fetcher)
  const url = (payload as { invite?: { url?: unknown } } | null)?.invite?.url
  if (!response.ok || typeof url !== "string" || !parseReferralCodeFromUrl(url)) {
    throw new Error("Blumi could not create an invite link yet.")
  }
  return { url }
}

export async function claimReferralInvite(
  baseHttpUrl: string,
  sessionToken: string,
  code: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const { response } = await requestJson(baseHttpUrl, "/v1/referrals/claim", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ code })
  }, fetcher)
  if (!response.ok && response.status !== 204) {
    throw new Error("Blumi could not save this invite yet.")
  }
}
