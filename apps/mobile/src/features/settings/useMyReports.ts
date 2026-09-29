import { useCallback, useEffect, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { fetchMySafetyReports, type MySafetyReportRecord } from "../safety/safetyApi"
import type { SessionActor } from "../session/sessionModel"
import type { SettingsLoadStatus } from "./settingsPresentationModel"

/** The signed-in person's own safety reports, fetched while the panel is open. */
export function useMyReports(sessionActor: SessionActor) {
  const [myReportsVisible, setMyReportsVisible] = useState(false)
  const [myReports, setMyReports] = useState<MySafetyReportRecord[]>([])
  const [myReportsStatus, setMyReportsStatus] = useState<SettingsLoadStatus>("idle")
  const [myReportsRetry, setMyReportsRetry] = useState(0)

  useEffect(() => {
    if (!myReportsVisible || sessionActor.session.mode !== "production") return
    const controller = new AbortController()
    setMyReportsStatus("loading")
    void fetchMySafetyReports(
      MOBILE_HTTP_BASE_URL,
      sessionActor.session.sessionToken,
      fetch,
      controller.signal
    ).then((reports) => {
      if (!controller.signal.aborted) {
        setMyReports(reports)
        setMyReportsStatus("ready")
      }
    }).catch(() => {
      if (!controller.signal.aborted) setMyReportsStatus("error")
    })
    return () => controller.abort()
  }, [myReportsRetry, myReportsVisible, sessionActor.session.mode, sessionActor.session.sessionToken])

  const toggleMyReports = useCallback(() => setMyReportsVisible((visible) => !visible), [])
  const retryMyReports = useCallback(() => setMyReportsRetry((value) => value + 1), [])

  return { myReportsVisible, myReports, myReportsStatus, toggleMyReports, retryMyReports }
}
