import { describe, expect, test } from 'bun:test'
import {
  getSoftphoneCallHistorySummary,
  getSoftphoneFeedbackOverviewData,
  getSoftphoneNegativeFeedbackByPhaseData,
  normalizeSoftphoneCallHistoryEntry,
  resolveSoftphonePhaseGroupTitle,
  updateSoftphoneCallHistoryEntryFeedback,
  type SoftphoneCallHistoryEntry,
} from '@/features/softphone/call-history'
import { createDefaultSoftphoneScenario } from '@/features/softphone/scenario'

function createEntry(overrides: Partial<SoftphoneCallHistoryEntry> = {}): SoftphoneCallHistoryEntry {
  return {
    callIdentifier: 'call-1',
    correlationCode: '1234',
    createdAt: '2026-03-13T10:00:00.000Z',
    debugInformation: null,
    endedAt: '2026-03-13T10:03:00.000Z',
    feedback: null,
    finalCallState: 'disconnected',
    generatedCaseData: null,
    id: 'entry-1',
    intents: [],
    ivrRawText: null,
    journeyStartedAt: '2026-03-13T10:00:30.000Z',
    phases: [
      { phaseId: 'softphone_correlation_code', timestamp: '2026-03-13T10:00:05.000Z' },
      { phaseId: 'privacy_opt_in', timestamp: '2026-03-13T10:00:30.000Z' },
    ],
    profileId: 'profile-1',
    profileName: 'Demo profile',
    recognizedData: null,
    scenarioId: 'DEMOAA',
    scenarioName: 'Default demo scenario',
    scenarioSnapshot: createDefaultSoftphoneScenario(),
    sessionId: 'session-1',
    startedAt: '2026-03-13T10:00:00.000Z',
    totalDurationMs: 180_000,
    totalDurationWithoutInitMs: 150_000,
    ...overrides,
  }
}

describe('softphone call history', () => {
  test('normalizes legacy entries without feedback to null', () => {
    const entry = createEntry()
    delete entry.feedback

    const normalizedEntry = normalizeSoftphoneCallHistoryEntry(entry)

    expect(normalizedEntry.feedback).toBeNull()
  })

  test('updates feedback on the targeted entry only', () => {
    const firstEntry = createEntry()
    const secondEntry = createEntry({ id: 'entry-2' })

    const result = updateSoftphoneCallHistoryEntryFeedback(
      [firstEntry, secondEntry],
      'entry-2',
      {
        note: 'Address capture felt slow.',
        phaseGroup: 'authentication_address',
        sentiment: 'down',
        severityRating: 4,
        submittedAt: '2026-03-13T10:04:00.000Z',
      },
    )

    expect(result[0]?.feedback).toBeNull()
    expect(result[1]?.feedback).toEqual({
      note: 'Address capture felt slow.',
      phaseGroup: 'authentication_address',
      sentiment: 'down',
      severityRating: 4,
      submittedAt: '2026-03-13T10:04:00.000Z',
    })
  })

  test('summarizes feedback rates from stored entries', () => {
    const history = [
      createEntry({
        feedback: {
          note: null,
          phaseGroup: null,
          sentiment: 'up',
          severityRating: null,
          submittedAt: '2026-03-13T10:04:00.000Z',
        },
        id: 'entry-1',
      }),
      createEntry({
        feedback: {
          note: 'Intent felt wrong.',
          phaseGroup: 'intent_identification',
          sentiment: 'down',
          severityRating: 3,
          submittedAt: '2026-03-13T10:05:00.000Z',
        },
        id: 'entry-2',
      }),
      createEntry({ feedback: null, id: 'entry-3' }),
    ]

    const summary = getSoftphoneCallHistorySummary(history)

    expect(summary.totalCalls).toBe(3)
    expect(summary.respondedFeedbackCalls).toBe(2)
    expect(summary.feedbackRate).toBe(67)
    expect(summary.positiveRate).toBe(50)
  })

  test('builds feedback overview and negative-phase analytics', () => {
    const history = [
      createEntry({
        feedback: {
          note: null,
          phaseGroup: null,
          sentiment: 'up',
          severityRating: null,
          submittedAt: '2026-03-13T10:04:00.000Z',
        },
        id: 'entry-1',
      }),
      createEntry({
        feedback: {
          note: 'The call dropped after opt-in.',
          phaseGroup: 'privacy_opt_in',
          sentiment: 'down',
          severityRating: 5,
          submittedAt: '2026-03-13T10:05:00.000Z',
        },
        id: 'entry-2',
      }),
      createEntry({ feedback: null, id: 'entry-3' }),
    ]

    expect(getSoftphoneFeedbackOverviewData(history)).toEqual([
      { count: 1, sentiment: 'No feedback' },
      { count: 1, sentiment: 'Thumbs up' },
      { count: 1, sentiment: 'Thumbs down' },
    ])
    expect(getSoftphoneNegativeFeedbackByPhaseData(history)).toEqual([
      { count: 0, step: 'Init' },
      { count: 1, step: 'Opt-In' },
      { count: 0, step: 'Intent' },
    ])
    expect(resolveSoftphonePhaseGroupTitle('privacy_opt_in', createDefaultSoftphoneScenario())).toBe('Opt-In')
  })
})
