import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { mirrorSoftphoneCallToAdminStorage } from '@/features/admin-softphone/server'
import {
  loadStoredSoftphoneCallHistory,
  resolveJourneyStartedAt,
  saveStoredSoftphoneCallHistory,
  SOFTPHONE_CALL_HISTORY_LIMIT,
  subscribeToSoftphoneCallHistory,
  updateSoftphoneCallHistoryEntryFeedback,
  type SoftphoneCallFeedback,
  type SoftphoneCallHistoryEntry,
  type SoftphoneCallHistoryTextEvent,
} from '@/features/softphone/call-history'
import type {
  SoftphoneCaseState,
  SoftphoneProfile,
  SoftphoneProfileSnapshot,
  SoftphoneScenarioSnapshot,
} from '@/features/softphone/types'

const EMPTY_SOFTPHONE_CALL_HISTORY: SoftphoneCallHistoryEntry[] = []

type ActiveCallDraft = {
  callIdentifier: string | null
  correlationCode: string | null
  debugInformation: string | null
  debugInformationEvents: SoftphoneCallHistoryTextEvent[]
  finalCallState: string | null
  generatedCaseData: SoftphoneCaseState['caseData']
  intents: string[]
  ivrRawText: string | null
  ivrRawTextEvents: SoftphoneCallHistoryTextEvent[]
  phases: SoftphoneCaseState['phaseEvents']
  profileId: string | null
  profileName: string | null
  profileSnapshot: SoftphoneProfileSnapshot | null
  recognizedData: SoftphoneCaseState['recognizedData']
  scenarioId: string | null
  scenarioName: string | null
  scenarioSnapshot: SoftphoneScenarioSnapshot | null
  sessionId: string | null
  startedAt: string
}

function cloneValue<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T
}

function resolveEventTimestamp(caseState: SoftphoneCaseState | null) {
  const timestamp = caseState?.updatedAt ?? new Date().toISOString()
  const parsedTimestamp = new Date(timestamp).getTime()

  return Number.isNaN(parsedTimestamp) ? new Date().toISOString() : new Date(parsedTimestamp).toISOString()
}

function appendTextEvent(
  events: SoftphoneCallHistoryTextEvent[],
  text: string | null | undefined,
  timestamp: string,
) {
  const normalizedText = text?.trim()

  if (!normalizedText) {
    return events
  }

  const lastEvent = events.at(-1)

  if (lastEvent?.text === normalizedText) {
    return events
  }

  return [...events, { text: normalizedText, timestamp }]
}

function createDraft(input: {
  activeCallState: string
  callIdentifier: string
  caseState: SoftphoneCaseState | null
  correlationCode: string
  profile: SoftphoneProfile | null
  scenario: SoftphoneScenarioSnapshot | null
  sessionId: string
}): ActiveCallDraft {
  const eventTimestamp = resolveEventTimestamp(input.caseState)
  const debugInformation = input.caseState?.debugInformation?.text ?? null
  const ivrRawText = input.caseState?.ivrRawText?.text ?? null

  return {
    callIdentifier: input.callIdentifier.trim() || null,
    correlationCode: input.correlationCode.trim() || null,
    debugInformation,
    debugInformationEvents: appendTextEvent([], debugInformation, eventTimestamp),
    finalCallState: input.activeCallState.trim() || null,
    generatedCaseData: cloneValue(input.caseState?.caseData ?? null),
    intents: cloneValue(input.caseState?.intents ?? []),
    ivrRawText,
    ivrRawTextEvents: appendTextEvent([], ivrRawText, eventTimestamp),
    phases: cloneValue(input.caseState?.phaseEvents ?? []),
    profileId: input.profile?.id ?? null,
    profileName: input.profile?.name ?? null,
    profileSnapshot: cloneValue(input.profile),
    recognizedData: cloneValue(input.caseState?.recognizedData ?? null),
    scenarioId: input.scenario?.id ?? null,
    scenarioName: input.scenario?.name ?? null,
    scenarioSnapshot: cloneValue(input.scenario),
    sessionId: input.sessionId.trim() || null,
    startedAt: new Date().toISOString(),
  }
}

function finalizeDraft(draft: ActiveCallDraft): SoftphoneCallHistoryEntry {
  const endedAt = new Date().toISOString()
  const startedAtMs = new Date(draft.startedAt).getTime()
  const endedAtMs = new Date(endedAt).getTime()
  const totalDurationMs =
    Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs) || endedAtMs < startedAtMs
      ? 0
      : endedAtMs - startedAtMs
  const journeyStartedAt = resolveJourneyStartedAt(draft.phases, draft.startedAt)
  const journeyStartedAtMs = new Date(journeyStartedAt).getTime()
  const totalDurationWithoutInitMs =
    Number.isNaN(journeyStartedAtMs) || Number.isNaN(endedAtMs) || endedAtMs < journeyStartedAtMs
      ? totalDurationMs
      : endedAtMs - journeyStartedAtMs

  return {
    callIdentifier: draft.callIdentifier,
    correlationCode: draft.correlationCode,
    createdAt: endedAt,
    debugInformation: draft.debugInformation,
    debugInformationEvents: cloneValue(draft.debugInformationEvents),
    endedAt,
    finalCallState: draft.finalCallState,
    generatedCaseData: cloneValue(draft.generatedCaseData),
    id: crypto.randomUUID(),
    intents: cloneValue(draft.intents),
    ivrRawText: draft.ivrRawText,
    ivrRawTextEvents: cloneValue(draft.ivrRawTextEvents),
    journeyStartedAt,
    phases: cloneValue(draft.phases),
    profileId: draft.profileId,
    profileName: draft.profileName,
    profileSnapshot: cloneValue(draft.profileSnapshot),
    recognizedData: cloneValue(draft.recognizedData),
    scenarioId: draft.scenarioId,
    scenarioName: draft.scenarioName,
    scenarioSnapshot: cloneValue(draft.scenarioSnapshot),
    sessionId: draft.sessionId,
    startedAt: draft.startedAt,
    totalDurationMs,
    totalDurationWithoutInitMs,
  }
}

export function useSoftphoneCallHistory(input: {
  activeCallState: string
  callIdentifier: string
  caseState: SoftphoneCaseState | null
  correlationCode: string
  hasActiveCall: boolean
  profile: SoftphoneProfile | null
  scenario: SoftphoneScenarioSnapshot | null
  sessionId: string
}) {
  const activeCallDraftRef = useRef<ActiveCallDraft | null>(null)
  const [pendingFeedbackEntryId, setPendingFeedbackEntryId] = useState<string | null>(null)
  const store = useStoredSoftphoneCallHistory()
  const { history, hydrated } = store
  async function mirrorCallToAdminStorage(entry: SoftphoneCallHistoryEntry) {
    void mirrorSoftphoneCallToAdminStorage({
      data: {
        call: entry,
      },
    }).catch((error) => {
      console.error('Failed to mirror softphone call to admin storage.', error)
    })
  }
  const pendingFeedbackEntry = useMemo(
    () => history.find((entry) => entry.id === pendingFeedbackEntryId) ?? null,
    [history, pendingFeedbackEntryId],
  )

  useEffect(() => {
    if (!input.hasActiveCall || activeCallDraftRef.current == null) {
      return
    }

    const eventTimestamp = resolveEventTimestamp(input.caseState)
    const nextDebugInformation =
      input.caseState?.debugInformation?.text ?? activeCallDraftRef.current.debugInformation
    const nextIvrRawText = input.caseState?.ivrRawText?.text ?? activeCallDraftRef.current.ivrRawText

    activeCallDraftRef.current = {
      ...activeCallDraftRef.current,
      callIdentifier: input.callIdentifier.trim() || activeCallDraftRef.current.callIdentifier,
      correlationCode: input.correlationCode.trim() || activeCallDraftRef.current.correlationCode,
      debugInformation: nextDebugInformation,
      debugInformationEvents: appendTextEvent(
        activeCallDraftRef.current.debugInformationEvents,
        nextDebugInformation,
        eventTimestamp,
      ),
      finalCallState: input.activeCallState.trim() || activeCallDraftRef.current.finalCallState,
      generatedCaseData: cloneValue(input.caseState?.caseData ?? activeCallDraftRef.current.generatedCaseData),
      intents: cloneValue(input.caseState?.intents ?? activeCallDraftRef.current.intents),
      ivrRawText: nextIvrRawText,
      ivrRawTextEvents: appendTextEvent(
        activeCallDraftRef.current.ivrRawTextEvents,
        nextIvrRawText,
        eventTimestamp,
      ),
      phases: cloneValue(input.caseState?.phaseEvents ?? activeCallDraftRef.current.phases),
      profileId: input.profile?.id ?? activeCallDraftRef.current.profileId,
      profileName: input.profile?.name ?? activeCallDraftRef.current.profileName,
      profileSnapshot: cloneValue(input.profile ?? activeCallDraftRef.current.profileSnapshot),
      recognizedData: cloneValue(input.caseState?.recognizedData ?? activeCallDraftRef.current.recognizedData),
      scenarioId: input.scenario?.id ?? activeCallDraftRef.current.scenarioId,
      scenarioName: input.scenario?.name ?? activeCallDraftRef.current.scenarioName,
      scenarioSnapshot: cloneValue(input.scenario ?? activeCallDraftRef.current.scenarioSnapshot),
      sessionId: input.sessionId.trim() || activeCallDraftRef.current.sessionId,
    }
  }, [
    input.activeCallState,
    input.callIdentifier,
    input.caseState,
    input.correlationCode,
    input.hasActiveCall,
    input.profile,
    input.scenario,
    input.sessionId,
  ])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    if (input.hasActiveCall) {
      if (activeCallDraftRef.current == null) {
        activeCallDraftRef.current = createDraft({
          activeCallState: input.activeCallState,
          callIdentifier: input.callIdentifier,
          caseState: input.caseState,
          correlationCode: input.correlationCode,
          profile: input.profile,
          scenario: input.scenario,
          sessionId: input.sessionId,
        })
      }

      return
    }

    const activeDraft = activeCallDraftRef.current

    if (activeDraft == null) {
      return
    }

    const nextEntry = finalizeDraft(activeDraft)
    activeCallDraftRef.current = null

    saveStoredSoftphoneCallHistory([nextEntry, ...history].slice(0, SOFTPHONE_CALL_HISTORY_LIMIT))
    void mirrorCallToAdminStorage(nextEntry)
    setPendingFeedbackEntryId(nextEntry.id)
  }, [
    history,
    hydrated,
    input.activeCallState,
    input.callIdentifier,
    input.caseState,
    input.correlationCode,
    input.hasActiveCall,
    input.profile,
    input.scenario,
    input.sessionId,
  ])

  return {
    ...store,
    clearHistory() {
      store.clearHistory()
      setPendingFeedbackEntryId(null)
    },
    dismissPendingFeedback() {
      setPendingFeedbackEntryId(null)
    },
    pendingFeedbackEntry,
    submitFeedback(entryId: string, feedback: SoftphoneCallFeedback) {
      const nextHistory = updateSoftphoneCallHistoryEntryFeedback(history, entryId, feedback)
      saveStoredSoftphoneCallHistory(nextHistory)
      const nextEntry = nextHistory.find((entry) => entry.id === entryId)
      if (nextEntry != null) {
        void mirrorCallToAdminStorage(nextEntry)
      }
      setPendingFeedbackEntryId((currentValue) => currentValue === entryId ? null : currentValue)
    },
  }
}

export function useStoredSoftphoneCallHistory() {
  const history = useSyncExternalStore(
    subscribeToSoftphoneCallHistory,
    loadStoredSoftphoneCallHistory,
    () => EMPTY_SOFTPHONE_CALL_HISTORY,
  )
  const hydrated = typeof window !== 'undefined'

  return {
    clearHistory() {
      saveStoredSoftphoneCallHistory([])
    },
    hydrated,
    history,
  }
}
