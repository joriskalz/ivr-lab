import type { SoftphoneCaseState } from '@/features/softphone/types'

const SOFTPHONE_EVENT_SUBSCRIBERS_KEY = '__contosoSoftphoneEventSubscribers'

type SoftphoneCaseStateListener = (caseState: SoftphoneCaseState) => void

type SoftphoneGlobalEventStore = typeof globalThis & {
  [SOFTPHONE_EVENT_SUBSCRIBERS_KEY]?: Map<string, Set<SoftphoneCaseStateListener>>
}

function cloneValue<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T
}

function getSubscriberStore() {
  const softphoneGlobal = globalThis as SoftphoneGlobalEventStore

  if (softphoneGlobal[SOFTPHONE_EVENT_SUBSCRIBERS_KEY] == null) {
    softphoneGlobal[SOFTPHONE_EVENT_SUBSCRIBERS_KEY] = new Map<string, Set<SoftphoneCaseStateListener>>()
  }

  return softphoneGlobal[SOFTPHONE_EVENT_SUBSCRIBERS_KEY] as Map<string, Set<SoftphoneCaseStateListener>>
}

export function publishSoftphoneCaseState(sessionId: string, caseState: SoftphoneCaseState) {
  const listeners = getSubscriberStore().get(sessionId)

  if (listeners == null || listeners.size === 0) {
    return
  }

  const eventPayload = cloneValue(caseState)

  for (const listener of listeners) {
    listener(eventPayload)
  }
}

export function subscribeToSoftphoneCaseState(
  sessionId: string,
  listener: SoftphoneCaseStateListener,
) {
  const subscriberStore = getSubscriberStore()
  const listeners = subscriberStore.get(sessionId) ?? new Set<SoftphoneCaseStateListener>()

  listeners.add(listener)
  subscriberStore.set(sessionId, listeners)

  return () => {
    const activeListeners = subscriberStore.get(sessionId)

    if (activeListeners == null) {
      return
    }

    activeListeners.delete(listener)

    if (activeListeners.size === 0) {
      subscriberStore.delete(sessionId)
    }
  }
}

export function resetSoftphoneCaseEventBrokerForTests() {
  getSubscriberStore().clear()
}
