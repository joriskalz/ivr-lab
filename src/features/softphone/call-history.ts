import type {
  SoftphoneCaseDataPayload,
  SoftphoneCasePhaseEvent,
  SoftphoneProfileSnapshot,
  SoftphoneScenarioSnapshot,
} from '@/features/softphone/types'

export const SOFTPHONE_CALL_HISTORY_STORAGE_KEY = 'contoso-softphone-call-history'
export const SOFTPHONE_CALL_HISTORY_LIMIT = 100
const SOFTPHONE_CALL_HISTORY_CHANGE_EVENT = 'contoso-softphone-call-history-change'
const EMPTY_SOFTPHONE_CALL_HISTORY: SoftphoneCallHistoryEntry[] = []

let cachedSoftphoneCallHistoryRaw: string | null | undefined
let cachedSoftphoneCallHistoryValue: SoftphoneCallHistoryEntry[] = EMPTY_SOFTPHONE_CALL_HISTORY

export type SoftphoneFeedbackPhaseGroupId = string

export interface SoftphoneCallFeedback {
  note: string | null
  phaseGroup: SoftphoneFeedbackPhaseGroupId | null
  sentiment: 'down' | 'up'
  severityRating: 1 | 2 | 3 | 4 | 5 | null
  submittedAt: string
}

export interface SoftphoneCallHistoryTextEvent {
  text: string
  timestamp: string
}

export interface SoftphoneCallHistoryEntry {
  callIdentifier: string | null
  correlationCode: string | null
  createdAt: string
  debugInformation: string | null
  debugInformationEvents?: SoftphoneCallHistoryTextEvent[]
  endedAt: string
  feedback?: SoftphoneCallFeedback | null
  finalCallState: string | null
  generatedCaseData: SoftphoneCaseDataPayload | null
  id: string
  intents: string[]
  ivrRawText: string | null
  ivrRawTextEvents?: SoftphoneCallHistoryTextEvent[]
  journeyStartedAt: string
  phases: SoftphoneCasePhaseEvent[]
  profileId: string | null
  profileName: string | null
  profileSnapshot?: SoftphoneProfileSnapshot | null
  recognizedData: SoftphoneCaseDataPayload | null
  scenarioId: string | null
  scenarioName: string | null
  scenarioSnapshot?: SoftphoneScenarioSnapshot | null
  sessionId: string | null
  startedAt: string
  totalDurationMs: number
  totalDurationWithoutInitMs: number
}

export interface SoftphoneCallHistorySummary {
  averageJourneyDurationMs: number
  averageTotalDurationMs: number
  completedScenarioCalls: number
  feedbackRate: number
  positiveRate: number
  respondedFeedbackCalls: number
  totalCalls: number
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function sortPhaseEvents(events: SoftphoneCasePhaseEvent[]) {
  return [...events].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
}

function normalizeTextEvents(
  events: SoftphoneCallHistoryTextEvent[] | undefined,
  fallbackText: string | null,
  fallbackTimestamp: string,
) {
  const normalizedEvents = (events ?? [])
    .map((event) => ({
      text: event.text?.trim() ?? '',
      timestamp: event.timestamp,
    }))
    .filter((event) => event.text.length > 0)

  if (normalizedEvents.length > 0) {
    return normalizedEvents
  }

  const normalizedFallbackText = fallbackText?.trim()

  if (!normalizedFallbackText) {
    return []
  }

  return [{ text: normalizedFallbackText, timestamp: fallbackTimestamp }]
}

function resolveDurationMs(startedAt: string, endedAt: string) {
  const startedAtMs = new Date(startedAt).getTime()
  const endedAtMs = new Date(endedAt).getTime()

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs) || endedAtMs < startedAtMs) {
    return 0
  }

  return endedAtMs - startedAtMs
}

function resolvePhaseLabel(
  phaseId: string,
  scenarioSnapshot?: SoftphoneScenarioSnapshot | null,
) {
  return scenarioSnapshot?.config?.phases?.find((phase) => phase.id === phaseId)?.label ?? phaseId
}

function resolvePhaseCatalog(history: SoftphoneCallHistoryEntry[]) {
  const seen = new Set<string>()
  const catalog: Array<{ id: string; label: string }> = []

  for (const entry of history) {
    const scenarioPhases = entry.scenarioSnapshot?.config?.phases ?? []

    for (const phase of scenarioPhases) {
      if (seen.has(phase.id)) {
        continue
      }

      seen.add(phase.id)
      catalog.push({ id: phase.id, label: phase.label })
    }

    for (const phase of entry.phases ?? []) {
      if (seen.has(phase.phaseId)) {
        continue
      }

      seen.add(phase.phaseId)
      catalog.push({ id: phase.phaseId, label: resolvePhaseLabel(phase.phaseId, entry.scenarioSnapshot) })
    }
  }

  return catalog
}

function resolveFeedbackPhaseCatalog(history: SoftphoneCallHistoryEntry[]) {
  const phaseCatalog = resolvePhaseCatalog(history)
  const byId = new Map(phaseCatalog.map((phase) => [phase.id, phase]))

  for (const entry of history) {
    const phaseGroup = entry.feedback?.phaseGroup

    if (phaseGroup == null || byId.has(phaseGroup)) {
      continue
    }

    byId.set(phaseGroup, { id: phaseGroup, label: resolvePhaseLabel(phaseGroup, entry.scenarioSnapshot) })
  }

  return Array.from(byId.values())
}

function normalizeSoftphoneCallFeedback(feedback: SoftphoneCallHistoryEntry['feedback']) {
  if (feedback == null) {
    return null
  }

  if (feedback.sentiment !== 'up' && feedback.sentiment !== 'down') {
    return null
  }

  const note = feedback.note?.trim() ? feedback.note.trim() : null
  const phaseGroup = feedback.phaseGroup?.trim() || null
  const severityRating = [1, 2, 3, 4, 5].includes(feedback.severityRating ?? 0)
    ? feedback.severityRating
    : null
  const submittedAt = feedback.submittedAt?.trim()

  if (!submittedAt) {
    return null
  }

  return {
    note,
    phaseGroup: feedback.sentiment === 'down' ? phaseGroup : null,
    sentiment: feedback.sentiment,
    severityRating: feedback.sentiment === 'down' ? severityRating : null,
    submittedAt,
  } satisfies SoftphoneCallFeedback
}

export function resolveSoftphonePhaseGroupTitle(
  phaseGroupId: SoftphoneFeedbackPhaseGroupId | null | undefined,
  scenarioSnapshot?: SoftphoneScenarioSnapshot | null,
) {
  if (phaseGroupId == null) {
    return null
  }

  return resolvePhaseLabel(phaseGroupId, scenarioSnapshot)
}

export function formatSoftphoneDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0s'
  }

  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${totalSeconds}s`
  }

  return `${minutes}m ${seconds}s`
}

export function loadStoredSoftphoneCallHistory() {
  if (typeof window === 'undefined') {
    return EMPTY_SOFTPHONE_CALL_HISTORY
  }

  const rawValue = window.localStorage.getItem(SOFTPHONE_CALL_HISTORY_STORAGE_KEY)

  if (rawValue === cachedSoftphoneCallHistoryRaw) {
    return cachedSoftphoneCallHistoryValue
  }

  if (!rawValue) {
    cachedSoftphoneCallHistoryRaw = rawValue
    cachedSoftphoneCallHistoryValue = EMPTY_SOFTPHONE_CALL_HISTORY
    return cachedSoftphoneCallHistoryValue
  }

  try {
    cachedSoftphoneCallHistoryRaw = rawValue
    cachedSoftphoneCallHistoryValue = (JSON.parse(rawValue) as SoftphoneCallHistoryEntry[]).map(normalizeSoftphoneCallHistoryEntry)
    return cachedSoftphoneCallHistoryValue
  } catch {
    cachedSoftphoneCallHistoryRaw = rawValue
    cachedSoftphoneCallHistoryValue = EMPTY_SOFTPHONE_CALL_HISTORY
    return cachedSoftphoneCallHistoryValue
  }
}

export function saveStoredSoftphoneCallHistory(history: SoftphoneCallHistoryEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  const nextRawValue = JSON.stringify(history)
  cachedSoftphoneCallHistoryRaw = nextRawValue
  cachedSoftphoneCallHistoryValue = history
  window.localStorage.setItem(SOFTPHONE_CALL_HISTORY_STORAGE_KEY, nextRawValue)
  window.dispatchEvent(new Event(SOFTPHONE_CALL_HISTORY_CHANGE_EVENT))
}

export function subscribeToSoftphoneCallHistory(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleStorageChange = (event?: Event) => {
    if (event instanceof StorageEvent && event.key != null && event.key !== SOFTPHONE_CALL_HISTORY_STORAGE_KEY) {
      return
    }

    onStoreChange()
  }

  window.addEventListener('storage', handleStorageChange)
  window.addEventListener(SOFTPHONE_CALL_HISTORY_CHANGE_EVENT, handleStorageChange)

  return () => {
    window.removeEventListener('storage', handleStorageChange)
    window.removeEventListener(SOFTPHONE_CALL_HISTORY_CHANGE_EVENT, handleStorageChange)
  }
}

export function resolveJourneyStartedAt(
  phases: SoftphoneCasePhaseEvent[],
  fallbackStartedAt: string,
) {
  const firstPhase = sortPhaseEvents(phases).at(0)

  if (firstPhase == null) {
    return fallbackStartedAt
  }

  const fallbackStartedAtMs = new Date(fallbackStartedAt).getTime()
  const firstPhaseStartedAtMs = new Date(firstPhase.timestamp).getTime()

  if (Number.isNaN(fallbackStartedAtMs) || Number.isNaN(firstPhaseStartedAtMs)) {
    return fallbackStartedAt
  }

  return firstPhaseStartedAtMs < fallbackStartedAtMs ? fallbackStartedAt : firstPhase.timestamp
}

export function getSoftphoneCallHistorySummary(history: SoftphoneCallHistoryEntry[]): SoftphoneCallHistorySummary {
  const completedScenarioCalls = history.filter((entry) => {
    const expectedFinalPhaseId = entry.scenarioSnapshot?.config?.phases?.at(-1)?.id

    if (expectedFinalPhaseId == null) {
      return (entry.phases ?? []).length > 0
    }

    return (entry.phases ?? []).some((phase) => phase.phaseId === expectedFinalPhaseId)
  }).length
  const respondedFeedbackCalls = history.filter((entry) => entry.feedback != null).length
  const positiveFeedbackCalls = history.filter((entry) => entry.feedback?.sentiment === 'up').length

  return {
    averageJourneyDurationMs: average(history.map((entry) => entry.totalDurationWithoutInitMs)),
    averageTotalDurationMs: average(history.map((entry) => entry.totalDurationMs)),
    completedScenarioCalls,
    feedbackRate: history.length === 0 ? 0 : Math.round((respondedFeedbackCalls / history.length) * 100),
    positiveRate: respondedFeedbackCalls === 0 ? 0 : Math.round((positiveFeedbackCalls / respondedFeedbackCalls) * 100),
    respondedFeedbackCalls,
    totalCalls: history.length,
  }
}

export function getSoftphoneCallDurationTrend(history: SoftphoneCallHistoryEntry[]) {
  return history
    .slice(0, 12)
    .reverse()
    .map((entry) => ({
      call: new Date(entry.endedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      journeyMinutes: Math.round((entry.totalDurationWithoutInitMs / 1000 / 60) * 10) / 10,
      totalMinutes: Math.round((entry.totalDurationMs / 1000 / 60) * 10) / 10,
    }))
}

export function getSoftphonePhaseReachData(history: SoftphoneCallHistoryEntry[]) {
  return resolvePhaseCatalog(history).map((phase) => ({
    reached: history.filter((entry) => (entry.phases ?? []).some((event) => event.phaseId === phase.id)).length,
    step: phase.label,
  }))
}

export function getSoftphoneAverageElapsedToStep(history: SoftphoneCallHistoryEntry[]) {
  return resolvePhaseCatalog(history).map((phase) => {
    const values = history
      .map((entry) => {
        const completionEvent = (entry.phases ?? []).find((event) => event.phaseId === phase.id)

        if (completionEvent == null) {
          return null
        }

        const startedAt = new Date(entry.journeyStartedAt).getTime()
        const completedAt = new Date(completionEvent.timestamp).getTime()

        if (Number.isNaN(startedAt) || Number.isNaN(completedAt) || completedAt < startedAt) {
          return null
        }

        return completedAt - startedAt
      })
      .filter((value): value is number => value != null)

    return {
      seconds: Math.round((average(values) / 1000) * 10) / 10,
      step: phase.label,
    }
  })
}

export function getSoftphoneFeedbackOverviewData(history: SoftphoneCallHistoryEntry[]) {
  const upCount = history.filter((entry) => entry.feedback?.sentiment === 'up').length
  const downCount = history.filter((entry) => entry.feedback?.sentiment === 'down').length
  const noFeedbackCount = Math.max(history.length - upCount - downCount, 0)

  return [
    { count: noFeedbackCount, sentiment: 'No feedback' },
    { count: upCount, sentiment: 'Thumbs up' },
    { count: downCount, sentiment: 'Thumbs down' },
  ]
}

export function getSoftphoneNegativeFeedbackByPhaseData(history: SoftphoneCallHistoryEntry[]) {
  return resolveFeedbackPhaseCatalog(history).map((phase) => ({
    count: history.filter((entry) => entry.feedback?.sentiment === 'down' && entry.feedback.phaseGroup === phase.id).length,
    step: phase.label,
  }))
}

export function updateSoftphoneCallHistoryEntryFeedback(
  history: SoftphoneCallHistoryEntry[],
  entryId: string,
  feedback: SoftphoneCallFeedback,
) {
  return history.map((entry) => (
    entry.id === entryId
      ? normalizeSoftphoneCallHistoryEntry({
        ...entry,
        feedback,
      })
      : entry
  ))
}

export function normalizeSoftphoneCallHistoryEntry(entry: SoftphoneCallHistoryEntry): SoftphoneCallHistoryEntry {
  const startedAt = entry.startedAt || entry.createdAt || new Date().toISOString()
  const endedAt = entry.endedAt || entry.createdAt || startedAt
  const phases = sortPhaseEvents(entry.phases ?? [])
  const totalDurationMs = resolveDurationMs(startedAt, endedAt)
  const journeyStartedAt = resolveJourneyStartedAt(phases, startedAt)
  const totalDurationWithoutInitMs = Math.min(resolveDurationMs(journeyStartedAt, endedAt), totalDurationMs)
  const debugInformationEvents = normalizeTextEvents(entry.debugInformationEvents, entry.debugInformation, endedAt)
  const ivrRawTextEvents = normalizeTextEvents(entry.ivrRawTextEvents, entry.ivrRawText, endedAt)

  return {
    ...entry,
    debugInformation: debugInformationEvents.at(-1)?.text ?? entry.debugInformation,
    debugInformationEvents,
    endedAt,
    feedback: normalizeSoftphoneCallFeedback(entry.feedback),
    intents: Array.from(new Set(entry.intents ?? [])),
    ivrRawText: ivrRawTextEvents.at(-1)?.text ?? entry.ivrRawText,
    ivrRawTextEvents,
    journeyStartedAt,
    phases,
    profileSnapshot: entry.profileSnapshot ?? null,
    scenarioId: entry.scenarioId ?? entry.scenarioSnapshot?.id ?? null,
    scenarioName: entry.scenarioName ?? entry.scenarioSnapshot?.name ?? null,
    scenarioSnapshot: entry.scenarioSnapshot ?? null,
    startedAt,
    totalDurationMs,
    totalDurationWithoutInitMs,
  }
}
