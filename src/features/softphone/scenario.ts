import type {
  SoftphoneProfile,
  SoftphoneScenarioConfig,
  SoftphoneScenarioFeatures,
  SoftphoneScenarioFieldType,
  SoftphoneScenarioProfileConfig,
  SoftphoneScenarioRecognizedField,
  SoftphoneScenarioSnapshot,
  SoftphoneScenarioSnapshotConfig,
  SoftphoneTestScenarioRecord,
  SoftphoneScenarioValue,
} from '@/features/softphone/types'
import { DEFAULT_SOFTPHONE_BRAND_COLOR, normalizeSoftphoneBrandColor } from '@/features/softphone/theme'
import { SOFTPHONE_SCENARIO_FIELD_TYPES } from '@/features/softphone/types'

const DEFAULT_SOFTPHONE_SCENARIO_ID = 'DEMOAA'
const DEFAULT_SOFTPHONE_SCENARIO_NAME = 'Default demo scenario'

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function createDefaultSoftphoneProfiles(): SoftphoneScenarioProfileConfig[] {
  return [
    {
      acsAccessKey: 'changeme',
      acsEndpoint: 'https://example.communication.azure.com',
      alternateCallerId: '+491701234569',
      id: 'primary_ivr',
      name: 'Primary IVR',
      primaryPhoneNumber: '+491701234567',
      titleText: 'Primary IVR',
    },
  ]
}

export function createDefaultSoftphoneScenarioConfig(): SoftphoneScenarioConfig {
  return {
    brandColor: DEFAULT_SOFTPHONE_BRAND_COLOR,
    features: {
      debugInformation: true,
      intents: true,
      phases: true,
      rawText: true,
      recognizedData: true,
    },
    phases: [
      { id: 'softphone_correlation_code', label: 'Init' },
      { id: 'privacy_opt_in', label: 'Opt-In' },
      { id: 'intent_identification', label: 'Intent' },
    ],
    profiles: createDefaultSoftphoneProfiles(),
    recognizedFields: [],
  }
}

export function createDefaultSoftphoneScenario(): SoftphoneTestScenarioRecord {
  const timestamp = new Date().toISOString()

  return {
    accessKey: '12345',
    config: createDefaultSoftphoneScenarioConfig(),
    createdAt: timestamp,
    id: DEFAULT_SOFTPHONE_SCENARIO_ID,
    name: DEFAULT_SOFTPHONE_SCENARIO_NAME,
    updatedAt: timestamp,
  }
}

export function createDefaultSoftphoneScenarioSnapshot(): SoftphoneScenarioSnapshot {
  return createSoftphoneScenarioSnapshot(createDefaultSoftphoneScenario())
}

function normalizeFieldType(value: unknown): SoftphoneScenarioFieldType {
  return SOFTPHONE_SCENARIO_FIELD_TYPES.includes(value as SoftphoneScenarioFieldType)
    ? value as SoftphoneScenarioFieldType
    : 'text'
}

function normalizeScenarioFeatures(value: unknown): SoftphoneScenarioFeatures {
  const record =
    value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}

  return {
    debugInformation: normalizeBoolean(record.debugInformation, true),
    intents: normalizeBoolean(record.intents, true),
    phases: normalizeBoolean(record.phases, true),
    rawText: normalizeBoolean(record.rawText, true),
    recognizedData: normalizeBoolean(record.recognizedData, true),
  }
}

function normalizeScenarioProfiles(value: unknown) {
  const profiles = Array.isArray(value) ? value : []
  const normalized = profiles
    .map((profile, index) => {
      const record =
        profile != null && typeof profile === 'object' && !Array.isArray(profile)
          ? profile as Record<string, unknown>
          : {}
      const id = normalizeScenarioKey(record.id, `profile_${index + 1}`)
      const name = normalizeString(record.name) || `Profile ${index + 1}`
      const acsEndpoint = normalizeString(record.acsEndpoint)
      const acsAccessKey = normalizeString(record.acsAccessKey)
      const primaryPhoneNumber = normalizeString(record.primaryPhoneNumber)
      const alternateCallerId = normalizeString(record.alternateCallerId)
      const titleText = normalizeString(record.titleText) || undefined

      if (!id || !name || !primaryPhoneNumber || !alternateCallerId || !acsEndpoint || !acsAccessKey) {
        return null
      }

      const normalizedProfile: SoftphoneScenarioProfileConfig = {
        acsAccessKey,
        acsEndpoint,
        alternateCallerId,
        id,
        name,
        primaryPhoneNumber,
        titleText,
      }

      return normalizedProfile
    })
    .filter((profile): profile is SoftphoneScenarioProfileConfig => profile !== null)
    .filter((profile, index, array) => array.findIndex((candidate) => candidate.id === profile.id) === index)

  return normalized.length > 0 ? normalized : createDefaultSoftphoneProfiles()
}

function normalizeScenarioPhases(value: unknown) {
  const phases = Array.isArray(value) ? value : []
  const normalized = phases
    .map((phase, index) => {
      const record =
        phase != null && typeof phase === 'object' && !Array.isArray(phase)
          ? phase as Record<string, unknown>
          : {}
      const id = normalizeScenarioKey(record.id, `phase_${index + 1}`)
      const label = normalizeString(record.label) || id

      return { id, label }
    })
    .filter((phase, index, array) => array.findIndex((candidate) => candidate.id === phase.id) === index)

  return normalized.length > 0 ? normalized : createDefaultSoftphoneScenarioConfig().phases
}

function normalizeRecognizedField(value: unknown, index: number, phaseIds: Set<string>): SoftphoneScenarioRecognizedField | null {
  const record =
    value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  const id = normalizeScenarioKey(record.id, `field_${index + 1}`)
  const label = normalizeString(record.label) || id
  const phaseIdCandidate = normalizeScenarioKey(record.phaseId, '')
  const phaseId = phaseIds.has(phaseIdCandidate)
    ? phaseIdCandidate
    : Array.from(phaseIds)[0] ?? 'default'
  const generatorValues = Array.isArray(record.generatorValues)
    ? record.generatorValues.map((entry) => normalizeString(entry)).filter((entry) => entry.length > 0)
    : []

  if (!id) {
    return null
  }

  const normalizedType = normalizeFieldType(record.type)
  const type = id === 'plz' && normalizedType === 'number'
    ? 'text'
    : normalizedType

  return {
    generatorValues,
    id,
    label,
    phaseId,
    type,
  }
}

function normalizeScenarioRecognizedFields(value: unknown, phaseIds: Set<string>) {
  const fields = Array.isArray(value) ? value : []
  const normalized = fields
    .map((field, index) => normalizeRecognizedField(field, index, phaseIds))
    .filter((field): field is SoftphoneScenarioRecognizedField => field != null)
    .filter((field, index, array) => array.findIndex((candidate) => candidate.id === field.id) === index)

  return normalized
}

export function normalizeScenarioKey(value: unknown, fallback: string) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

export function normalizeSoftphoneScenarioConfig(value: unknown): SoftphoneScenarioConfig {
  const record =
    value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  const phases = normalizeScenarioPhases(record.phases)
  const phaseIds = new Set(phases.map((phase) => phase.id))

  return {
    brandColor: normalizeSoftphoneBrandColor(record.brandColor),
    features: normalizeScenarioFeatures(record.features),
    phases,
    profiles: normalizeScenarioProfiles(record.profiles),
    recognizedFields: normalizeScenarioRecognizedFields(record.recognizedFields, phaseIds),
  }
}

export function parseScenarioValue(value: string, type: SoftphoneScenarioFieldType): SoftphoneScenarioValue {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  if (type === 'boolean') {
    return trimmedValue.toLowerCase() === 'true'
  }

  if (type === 'number') {
    const numericValue = Number(trimmedValue)
    return Number.isFinite(numericValue) ? numericValue : trimmedValue
  }

  return trimmedValue
}

export function formatScenarioValue(value: SoftphoneScenarioValue) {
  if (value == null) {
    return '-'
  }

  return String(value)
}

export function createSoftphonePublicProfile(profile: SoftphoneScenarioProfileConfig): SoftphoneProfile {
  return {
    alternateCallerId: profile.alternateCallerId,
    id: profile.id,
    name: profile.name,
    primaryPhoneNumber: profile.primaryPhoneNumber,
    titleText: profile.titleText,
  }
}

export function createSoftphoneScenarioSnapshotConfig(config: SoftphoneScenarioConfig): SoftphoneScenarioSnapshotConfig {
  return {
    brandColor: normalizeSoftphoneBrandColor(config.brandColor),
    features: config.features,
    phases: config.phases,
    profiles: config.profiles.map(createSoftphonePublicProfile),
    recognizedFields: config.recognizedFields,
  }
}

export function createSoftphoneScenarioSnapshot(scenario: SoftphoneTestScenarioRecord): SoftphoneScenarioSnapshot {
  return {
    config: createSoftphoneScenarioSnapshotConfig(scenario.config),
    createdAt: scenario.createdAt,
    id: scenario.id,
    name: scenario.name,
    updatedAt: scenario.updatedAt,
  }
}

export function generateScenarioCaseData(config: SoftphoneScenarioConfig): Record<string, SoftphoneScenarioValue> {
  const values: Record<string, SoftphoneScenarioValue> = {}

  for (const field of config.recognizedFields) {
    const candidates = field.generatorValues.filter((entry) => entry.trim().length > 0)
    const nextValue =
      candidates.length === 0
        ? null
        : candidates[Math.floor(Math.random() * candidates.length)] ?? null

    values[field.id] = nextValue == null ? null : parseScenarioValue(nextValue, field.type)
  }

  return values
}

export function resolveScenarioFieldLabel(config: SoftphoneScenarioConfig, fieldId: string) {
  return config.recognizedFields.find((field) => field.id === fieldId)?.label ?? fieldId
}
