import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { __resetDbForTests, getDb } from '@/db'
import { adminSoftphoneCalls, adminSoftphoneFeedback, softphoneScenarioManagers, user } from '@/db/schema'
import {
  deleteAdminSoftphoneHistoryForScenario,
  deleteSoftphoneTestScenario,
  getSoftphoneTestScenarioById,
  listAdminSoftphoneHistory,
  listSoftphoneTestScenarios,
  replaceSoftphoneScenarioManagers,
  saveSoftphoneTestScenario,
  upsertAdminSoftphoneCall,
} from '@/features/admin-softphone/queries'
import type { SoftphoneCallHistoryEntry } from '@/features/softphone/call-history'
import { createDefaultSoftphoneScenario, createDefaultSoftphoneScenarioConfig } from '@/features/softphone/scenario'

const TEST_DB_FILE = resolve(process.cwd(), '.data/test-admin-softphone.sqlite')
const ORIGINAL_DB_FILE_NAME = process.env.DB_FILE_NAME

function runMigrations() {
  mkdirSync(dirname(TEST_DB_FILE), { recursive: true })
  const sqlite = new Database(TEST_DB_FILE, { create: true })
  const db = drizzle(sqlite)
  migrate(db, {
    migrationsFolder: resolve(process.cwd(), 'drizzle'),
  })
  sqlite.close(false)
}

function createCall(overrides?: Partial<SoftphoneCallHistoryEntry>): SoftphoneCallHistoryEntry {
  return {
    callIdentifier: 'call-123',
    correlationCode: '1234',
    createdAt: '2026-03-14T12:00:00.000Z',
    debugInformation: 'intent=authenticate',
    debugInformationEvents: [],
    endedAt: '2026-03-14T12:05:00.000Z',
    feedback: null,
    finalCallState: 'Disconnected',
    generatedCaseData: null,
    id: 'entry-1',
    intents: [],
    ivrRawText: 'hello',
    ivrRawTextEvents: [],
    journeyStartedAt: '2026-03-14T12:01:00.000Z',
    phases: [],
    profileId: 'profile-1',
    profileName: 'Desk A',
    profileSnapshot: {
      alternateCallerId: '+491234567890',
      id: 'profile-1',
      name: 'Desk A',
      primaryPhoneNumber: '+491234567891',
      titleText: 'Collector',
    },
    recognizedData: null,
    scenarioId: 'DEMOAA',
    scenarioName: 'Default demo scenario',
    scenarioSnapshot: createDefaultSoftphoneScenario(),
    sessionId: 'session-1',
    startedAt: '2026-03-14T12:00:00.000Z',
    totalDurationMs: 300000,
    totalDurationWithoutInitMs: 240000,
    ...overrides,
  }
}

describe('admin softphone persistence', () => {
  beforeEach(() => {
    process.env.DB_FILE_NAME = TEST_DB_FILE
    rmSync(TEST_DB_FILE, { force: true })
    __resetDbForTests()
    runMigrations()
  })

  afterEach(() => {
    __resetDbForTests()
    rmSync(TEST_DB_FILE, { force: true })

    if (ORIGINAL_DB_FILE_NAME == null) {
      delete process.env.DB_FILE_NAME
    } else {
      process.env.DB_FILE_NAME = ORIGINAL_DB_FILE_NAME
    }
  })

  test('stores an anonymous mirrored call and updates feedback on the same record', () => {
    const initialCall = createCall()

    upsertAdminSoftphoneCall({
      call: initialCall,
      operator: null,
    })

    const feedbackCall = createCall({
      feedback: {
        note: 'Address step was too slow',
        phaseGroup: 'address',
        sentiment: 'down',
        severityRating: 4,
        submittedAt: '2026-03-14T12:06:00.000Z',
      },
    })

    upsertAdminSoftphoneCall({
      call: feedbackCall,
      operator: null,
    })

    const history = listAdminSoftphoneHistory()

    expect(history).toHaveLength(1)
    expect(history[0]?.feedback?.sentiment).toBe('down')
    expect(history[0]?.operator).toBeNull()

    const storedCallCount = getDb().select().from(adminSoftphoneCalls).all()
    const storedFeedbackCount = getDb().select().from(adminSoftphoneFeedback).all()

    expect(storedCallCount).toHaveLength(1)
    expect(storedFeedbackCount).toHaveLength(1)
  })

  test('creates and updates persisted softphone scenarios with 6-letter ids', () => {
    const createdScenario = saveSoftphoneTestScenario({
      config: createDefaultSoftphoneScenarioConfig(),
      name: 'Collections flow',
    })

    expect(createdScenario.id).toMatch(/^[A-Z]{6}$/)
    expect(createdScenario.accessKey).toMatch(/^\d{5}$/)
    expect(createdScenario.name).toBe('Collections flow')

    const listedScenarios = listSoftphoneTestScenarios()
    expect(listedScenarios).toHaveLength(1)
    expect(listedScenarios[0]?.id).toBe(createdScenario.id)

    const updatedScenario = saveSoftphoneTestScenario({
      config: {
        ...createDefaultSoftphoneScenarioConfig(),
        phases: [
          { id: 'greeting', label: 'Greeting' },
          { id: 'verification', label: 'Verification' },
        ],
      },
      accessKey: '54321',
      id: createdScenario.id,
      name: 'Collections flow v2',
    })

    expect(updatedScenario.id).toBe(createdScenario.id)
    expect(updatedScenario.accessKey).toBe('54321')
    expect(updatedScenario.name).toBe('Collections flow v2')
    expect(getSoftphoneTestScenarioById(createdScenario.id)?.config.phases).toEqual([
      { id: 'greeting', label: 'Greeting' },
      { id: 'verification', label: 'Verification' },
    ])
  })

  test('deletes persisted softphone scenarios and cascades manager assignments', () => {
    const createdScenario = saveSoftphoneTestScenario({
      config: createDefaultSoftphoneScenarioConfig(),
      name: 'Removable flow',
    })

    getDb()
      .insert(user)
      .values({
        email: 'manager@example.com',
        id: 'user-1',
        name: 'Scenario Manager',
      })
      .run()

    replaceSoftphoneScenarioManagers({
      scenarioId: createdScenario.id,
      userIds: ['user-1'],
    })

    expect(getDb().select().from(softphoneScenarioManagers).all()).toHaveLength(1)

    deleteSoftphoneTestScenario({
      scenarioId: createdScenario.id,
    })

    expect(getSoftphoneTestScenarioById(createdScenario.id)).toBeNull()
    expect(listSoftphoneTestScenarios()).toHaveLength(0)
    expect(getDb().select().from(softphoneScenarioManagers).all()).toHaveLength(0)
  })

  test('deletes persisted call analytics for a specific scenario', () => {
    upsertAdminSoftphoneCall({
      call: createCall({
        feedback: {
          note: 'Good',
          phaseGroup: 'welcome',
          sentiment: 'up',
          severityRating: 5,
          submittedAt: '2026-03-14T12:06:00.000Z',
        },
        id: 'entry-keep-1',
        scenarioId: 'KEEPAA',
        scenarioName: 'Keep scenario',
      }),
      operator: null,
    })

    upsertAdminSoftphoneCall({
      call: createCall({
        feedback: {
          note: 'Bad',
          phaseGroup: 'address',
          sentiment: 'down',
          severityRating: 4,
          submittedAt: '2026-03-14T12:07:00.000Z',
        },
        id: 'entry-delete-1',
        scenarioId: 'DEMOAA',
        scenarioName: 'Delete scenario',
      }),
      operator: null,
    })

    const deletedCount = deleteAdminSoftphoneHistoryForScenario('DEMOAA')
    expect(deletedCount).toBe(1)

    const history = listAdminSoftphoneHistory()
    expect(history).toHaveLength(1)
    expect(history[0]?.scenarioId).toBe('KEEPAA')

    expect(getDb().select().from(adminSoftphoneCalls).all()).toHaveLength(1)
    expect(getDb().select().from(adminSoftphoneFeedback).all()).toHaveLength(1)
  })
})
