import { useCallback, useEffect, useEffectEvent } from "react"
import { Alert } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import { hydrateBlockedUsersFromServer } from "../safety/blockStore"
import { unblockSafetyUser } from "../safety/safetyApi"
import type { AppLocale } from "../session/appLocale"
import type { WhenPushSettled } from "../../navigation/useAfterPushTransition"
import type { SessionActor } from "../session/sessionModel"
import { getSettingsActionErrorMessageForDisplay } from "../session/settingsActionErrorCopy"
import type { SettingsCopy } from "./settingsCopy"

const runNow: WhenPushSettled = (task) => {
  task()
  return () => undefined
}

/**
 * Refreshes the hidden-people list from the server for production sessions and
 * returns the confirm-then-unblock action. The block store itself stays owned
 * by the screen so its subscription order is unchanged.
 */
export function useHiddenPeople(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
  unblockUser: (blockedUserId: string, options?: { persist?: boolean }) => void
  /**
   * Runs the first server refresh once the screen's push has settled, so
   * it never re-renders the page mid-slide. Defaults to at once.
   */
  whenSettled?: WhenPushSettled
}) {
  const { copy, locale, sessionActor, unblockUser, whenSettled = runNow } = input

  // Locale only formats the failure toast: it is read when the refresh fails
  // and must not trigger another server hydration.
  const showRefreshFailure = useEffectEvent((error: unknown) => {
    showToast({
      title: "Hidden list not refreshed",
      body: getSettingsActionErrorMessageForDisplay("refreshHiddenList", error, locale),
      type: "warning"
    })
  })

  useEffect(() => {
    if (sessionActor.session.mode !== "production") return
    return whenSettled(() => {
      void hydrateBlockedUsersFromServer(
        sessionActor.profile.userId,
        sessionActor.session.sessionToken
      )
        .catch((error) => showRefreshFailure(error))
    })
  }, [sessionActor, whenSettled])

  return useCallback(
    (userId: string) => {
      Alert.alert(
        copy.showAgainTitle,
        copy.showAgainBody,
        [
          { text: copy.cancel, style: "cancel" },
          {
            text: copy.showAgain,
            style: "destructive",
            onPress: () => {
              if (sessionActor.session.mode !== "production") {
                unblockUser(userId)
                showToast({ title: copy.personVisibleAgain, type: "info" })
                return
              }
              void unblockSafetyUser(
                MOBILE_HTTP_BASE_URL,
                sessionActor.session.sessionToken,
                userId
              )
                .then(() => {
                  unblockUser(userId, { persist: false })
                  void hydrateBlockedUsersFromServer(
                    sessionActor.profile.userId,
                    sessionActor.session.sessionToken
                  ).catch(() => undefined)
                  showToast({ title: copy.personVisibleAgain, type: "info" })
                })
                .catch((error) => {
                  showToast({
                    title: "Could not update safety list",
                    body: getSettingsActionErrorMessageForDisplay("unblockPerson", error, locale),
                    type: "warning"
                  })
                })
            }
          }
        ]
      )
    },
    [copy, locale, sessionActor, unblockUser]
  )
}
