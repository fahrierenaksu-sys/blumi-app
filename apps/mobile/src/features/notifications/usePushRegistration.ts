import Constants from "expo-constants"
import * as Device from "expo-device"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Platform } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { captureAppException } from "../../observability/crashReporting"
import type { SessionActor } from "../session/sessionModel"
import { registerDevice, removeDevice, updateNotificationPreferences } from "./notificationApi"
import { createNotificationTimeZoneSync } from "./notificationTimeZoneSync"
import { shouldInitializeNativeNotifications } from "./notificationRuntimePolicy"
import { shouldRemovePushRegistration, syncPushRegistration } from "./pushRegistrationCoordinator"

type NotificationsModule = typeof import("expo-notifications")
type NotificationsPermissionStatus =
  import("expo-notifications").PermissionStatus

let notificationsModulePromise: Promise<NotificationsModule> | null = null
let hasInstalledNotificationHandler = false
const observedResponseOwners = new Map<string, { userId: string; delivered: boolean }>()
const MAX_OBSERVED_RESPONSE_OWNERS = 256

function rememberObservedResponseOwner(identifier: string, userId: string): void {
  if (observedResponseOwners.has(identifier)) return
  if (observedResponseOwners.size >= MAX_OBSERVED_RESPONSE_OWNERS) {
    const oldestIdentifier = observedResponseOwners.keys().next().value
    if (oldestIdentifier !== undefined) observedResponseOwners.delete(oldestIdentifier)
  }
  observedResponseOwners.set(identifier, { userId, delivered: false })
}

const SHOULD_INITIALIZE_NOTIFICATIONS = shouldInitializeNativeNotifications(
  Platform.OS,
  __DEV__
)

export function usePushRegistration(
  sessionActor: SessionActor | null,
  onNotificationResponseData?: (data: unknown, actor: SessionActor) => boolean,
  navigationReadyGeneration = 0
): {
  permissionStatus: "unknown" | "undetermined" | "granted" | "denied"
  isRequestingPermission: boolean
  requestPermission: () => Promise<void>
} {
  const mode = sessionActor?.session.mode
  const userId = sessionActor?.session.userId
  const sessionId = sessionActor?.session.sessionId
  const currentUserIdRef = useRef(userId)
  currentUserIdRef.current = userId
  const sessionActorRef = useRef(sessionActor)
  sessionActorRef.current = sessionActor
  const onNotificationResponseDataRef = useRef(onNotificationResponseData)
  onNotificationResponseDataRef.current = onNotificationResponseData
  const sessionToken = sessionActor?.session.mode === "production"
    ? sessionActor.session.sessionToken
    : undefined
  const [permissionStatus, setPermissionStatus] = useState<
    "unknown" | "undetermined" | "granted" | "denied"
  >("unknown")
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const requestSyncRef = useRef<(() => Promise<void>) | null>(null)
  const retryPendingResponsesRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    retryPendingResponsesRef.current?.()
  }, [navigationReadyGeneration, onNotificationResponseData])

  useEffect(() => {
    if (mode !== "production" || !sessionToken) return
    const controller = new AbortController()
    const sync = createNotificationTimeZoneSync({
      currentTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      update: (patch) => updateNotificationPreferences(MOBILE_HTTP_BASE_URL, sessionToken, patch, fetch, controller.signal)
    })
    const run = () => { void sync().catch((error) => {
      if (!controller.signal.aborted) captureAppException(error, { feature: "notification_timezone_sync" })
    }) }
    run()
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") run() })
    return () => { controller.abort(); subscription.remove() }
  }, [mode, sessionToken])

  useEffect(() => {
    if (
      !SHOULD_INITIALIZE_NOTIFICATIONS ||
      !sessionToken ||
      mode !== "production"
    ) {
      requestSyncRef.current = null
      setPermissionStatus("unknown")
      return
    }

    const abortController = new AbortController()
    let active = true
    let registeredPushToken: string | null = null
    let syncQueue = Promise.resolve()
    let pushTokenSubscription: { remove(): void } | null = null
    let responseSubscription: { remove(): void } | null = null
    let notificationsForDelivery: NotificationsModule | null = null
    const pendingResponses = new Map<string, {
      response: import("expo-notifications").NotificationResponse
      cached: boolean
      ownerUserId: string
    }>()

    const consumeCachedResponse = (notifications: NotificationsModule, identifier: string): void => {
      void notifications.getLastNotificationResponseAsync().then(async (last) => {
        if (active && last?.notification.request.identifier === identifier) {
          await notifications.clearLastNotificationResponseAsync()
        }
      }).catch((error) => {
        if (active) captureAppException(error, { feature: "push_response_consumption" })
      })
    }

    const rememberPendingResponse = (
      identifier: string,
      response: import("expo-notifications").NotificationResponse,
      cached: boolean,
      ownerUserId: string
    ): void => {
      if (!pendingResponses.has(identifier) && pendingResponses.size >= MAX_OBSERVED_RESPONSE_OWNERS) {
        const oldestIdentifier = pendingResponses.keys().next().value
        if (oldestIdentifier !== undefined) pendingResponses.delete(oldestIdentifier)
      }
      pendingResponses.set(identifier, { response, cached, ownerUserId })
    }

    const deliverResponse = (
      notifications: NotificationsModule,
      response: import("expo-notifications").NotificationResponse,
      cached: boolean
    ): void => {
      const currentActor = sessionActorRef.current
      if (
        !active ||
        !currentActor ||
        currentActor.session.mode !== mode ||
        currentActor.session.userId !== userId ||
        currentActor.session.sessionId !== sessionId ||
        currentActor.session.sessionToken !== sessionToken
      ) return
      const identifier = response.notification.request.identifier
      const pendingOwner = pendingResponses.get(identifier)?.ownerUserId
      const responseOwner = observedResponseOwners.get(identifier)?.userId ?? pendingOwner
      if (responseOwner && responseOwner !== currentActor.profile.userId) return
      const data = response.notification.request.content.data
      if (data && typeof data === "object" && "recipientUserId" in data &&
        data.recipientUserId !== currentActor.profile.userId) return
      if (!responseOwner) {
        rememberObservedResponseOwner(identifier, currentActor.profile.userId)
      }
      if (observedResponseOwners.get(identifier)?.delivered) {
        if (cached) consumeCachedResponse(notifications, identifier)
        return
      }
      if (onNotificationResponseDataRef.current?.(data, currentActor) !== true) {
        rememberPendingResponse(identifier, response, cached, currentActor.profile.userId)
        return
      }
      pendingResponses.delete(identifier)
      rememberObservedResponseOwner(identifier, currentActor.profile.userId)
      const deliveredOwner = observedResponseOwners.get(identifier)
      if (deliveredOwner?.userId === currentActor.profile.userId) {
        deliveredOwner.delivered = true
      }
      if (cached) consumeCachedResponse(notifications, identifier)
    }
    retryPendingResponsesRef.current = () => {
      if (!notificationsForDelivery) return
      for (const { response, cached } of pendingResponses.values()) {
        deliverResponse(notificationsForDelivery, response, cached)
      }
    }

    const sync = (allowPermissionPrompt: boolean): Promise<void> => {
      const task = syncQueue.then(async () => {
        if (!active) return
        const notifications = await loadNotificationsModule()
        ensureNotificationHandler(notifications)
        const result = await syncPushRegistration({
          mode,
          allowPermissionPrompt,
          dependencies: {
            isPhysicalDevice: Device.isDevice,
            platform: Platform.OS === "android" ? "android" : "ios",
            createAndroidChannel: createAndroidNotificationChannel,
            getPermissionStatus: async () =>
              normalizePermissionStatus(
                (await notifications.getPermissionsAsync()).status
              ),
            requestPermission: async () =>
              normalizePermissionStatus(
                (await notifications.requestPermissionsAsync()).status
              ),
            getExpoPushToken: async () => {
              const projectId =
                Constants.expoConfig?.extra?.eas?.projectId ??
                Constants.easConfig?.projectId
              if (typeof projectId !== "string" || projectId.trim().length === 0) {
                throw new Error("Expo project ID is unavailable for push registration.")
              }
              return (await notifications.getExpoPushTokenAsync({ projectId })).data
            },
            registerDevice: async (input) => {
              await registerDevice(
                MOBILE_HTTP_BASE_URL,
                sessionToken,
                input,
                fetch,
                abortController.signal
              )
            }
          }
        })
        if (!active) return
        if (result.status === "registered") {
          registeredPushToken = result.pushToken
          setPermissionStatus("granted")
        } else if (result.reason === "permission-denied") {
          setPermissionStatus("denied")
        } else if (result.reason === "permission-not-requested") {
          setPermissionStatus("undetermined")
        }
      }).catch((error) => {
        if (active) {
          if (!isAbortError(error)) {
            captureAppException(error, { feature: "push_registration" })
          }
        }
        throw error
      })
      syncQueue = task.catch(() => undefined)
      return task
    }

    void loadNotificationsModule()
      .then(async (notifications) => {
        if (!active) return
        notificationsForDelivery = notifications
        ensureNotificationHandler(notifications)
        requestSyncRef.current = () => sync(true)
        void sync(false).catch(() => undefined)
        pushTokenSubscription = notifications.addPushTokenListener(() => {
          void sync(false).catch(() => undefined)
        })
        responseSubscription =
          notifications.addNotificationResponseReceivedListener((response) => {
            deliverResponse(notifications, response, false)
          })
        const response = await notifications.getLastNotificationResponseAsync()
        if (!active || !response) return
        deliverResponse(notifications, response, true)
      })
      .catch((error) => {
        if (!active || isAbortError(error)) return
        captureAppException(error, { feature: "push_runtime_setup" })
      })

    return () => {
      active = false
      retryPendingResponsesRef.current = null
      pendingResponses.clear()
      requestSyncRef.current = null
      abortController.abort()
      pushTokenSubscription?.remove()
      responseSubscription?.remove()
      // Credential rotation is not logout: its old effect must not remove the
      // same account's newly refreshed registration and queued notifications.
      if (registeredPushToken && shouldRemovePushRegistration(userId, currentUserIdRef.current)) {
        void removeDevice(
          MOBILE_HTTP_BASE_URL,
          sessionToken,
          registeredPushToken
        ).catch((error) => {
          captureAppException(error, { feature: "push_device_cleanup" })
        })
      }
    }
  }, [mode, sessionId, sessionToken, userId])

  const requestPermission = useCallback(async (): Promise<void> => {
    const requestSync = requestSyncRef.current
    if (!requestSync || isRequestingPermission) return
    setIsRequestingPermission(true)
    try {
      await requestSync()
    } finally {
      setIsRequestingPermission(false)
    }
  }, [isRequestingPermission])

  return {
    permissionStatus,
    isRequestingPermission,
    requestPermission
  }
}

async function createAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return
  const notifications = await loadNotificationsModule()
  ensureNotificationHandler(notifications)
  await notifications.setNotificationChannelAsync("default", {
    name: "Blumi",
    importance: notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: "#F26779"
  })
}

function normalizePermissionStatus(
  status: NotificationsPermissionStatus
): "granted" | "denied" | "undetermined" {
  const granted = "granted"
  const denied = "denied"
  if (status === granted) return granted
  if (status === denied) return denied
  return "undetermined"
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

async function loadNotificationsModule(): Promise<NotificationsModule> {
  notificationsModulePromise ??= import("expo-notifications")
  return notificationsModulePromise
}

function ensureNotificationHandler(notifications: NotificationsModule): void {
  if (hasInstalledNotificationHandler) return
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  })
  hasInstalledNotificationHandler = true
}
