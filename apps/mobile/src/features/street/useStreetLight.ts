import { useEffect, useState } from "react"
import { streetLightForHour, type StreetLight } from "./streetNoteModel"

const MS_PER_HOUR = 60 * 60 * 1000

function msUntilNextHour(now: Date): number {
  return MS_PER_HOUR - (now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds())
}

/** The light of the viewer's current hour; one timer, re-armed at each hour while the street is on screen. */
export function useStreetLight(): StreetLight {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const timer = setTimeout(() => setHour(new Date().getHours()), msUntilNextHour(new Date()))
    return () => clearTimeout(timer)
  }, [hour])
  return streetLightForHour(hour)
}
