/** Foreground timezone sync never requests notification permission or changes quiet-hour choices. */
export function createNotificationTimeZoneSync(input: {
  currentTimeZone: () => string
  update: (patch: { quietHoursTimeZone: string }) => Promise<unknown>
}) {
  let synced: string | null = null
  let pending = Promise.resolve()
  return () => {
    const result = pending.then(async () => {
      const timeZone = input.currentTimeZone()
      if (!timeZone || timeZone === synced) return
      await input.update({ quietHoursTimeZone: timeZone })
      synced = timeZone
    })
    pending = result.catch(() => undefined)
    return result
  }
}
