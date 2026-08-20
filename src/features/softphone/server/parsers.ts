import type {
  SoftphoneCaseDataPayload,
  SoftphoneCasePhaseEvent,
  SoftphoneFieldMetadataMap,
  SoftphoneIntentPayload,
  SoftphoneIvrEventEnvelope,
  SoftphoneMetadataValues,
  SoftphoneScenarioValue,
  SoftphoneTextPayload,
} from '@/features/softphone/types'
import { SOFTPHONE_IVR_EVENT_TYPES } from '@/features/softphone/types'

type ParseSuccess<T> = {
  ok: true
  value: T
}

type ParseFailure = {
  issues: string[]
  ok: false
}

type ParseResult<T> = ParseSuccess<T> | ParseFailure

function ok<T>(value: T): ParseSuccess<T> {
  return { ok: true, value }
}

function fail(...issues: string[]): ParseFailure {
  return { issues, ok: false }
}

function normalizeNullableString(value: unknown) {
  if (value == null) {
    return null
  }

  const normalizedValue = String(value).trim()
  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeIsoTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }

  const normalizedValue = normalizeNullableString(value)

  if (normalizedValue == null) {
    return new Date().toISOString()
  }

  if (/^\d+$/.test(normalizedValue)) {
    const numericTimestamp = Number(normalizedValue)

    if (Number.isFinite(numericTimestamp)) {
      return new Date(numericTimestamp).toISOString()
    }
  }

  const parsedTimestamp = new Date(normalizedValue)
  return Number.isNaN(parsedTimestamp.getTime()) ? new Date().toISOString() : parsedTimestamp.toISOString()
}

function normalizeScenarioValue(value: unknown): SoftphoneScenarioValue {
  if (value == null) {
    return null
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim()
    return normalizedValue.length > 0 ? normalizedValue : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'boolean') {
    return value
  }

  return normalizeNullableString(JSON.stringify(value))
}

function parseValueRecord(record: Record<string, unknown>): Record<string, SoftphoneScenarioValue> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, normalizeScenarioValue(value)]),
  )
}

function parseMetadataValues(value: unknown): SoftphoneMetadataValues | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const source =
    record.values != null && typeof record.values === 'object' && !Array.isArray(record.values)
      ? record.values as Record<string, unknown>
      : record

  const values = parseValueRecord(source)
  return Object.keys(values).length > 0 ? { values } : undefined
}

function parseFieldMetadataMap(value: unknown): SoftphoneFieldMetadataMap | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const metadataEntries = Object.entries(record)
    .map(([fieldId, metadataValue]) => {
      const metadata = parseMetadataValues(metadataValue)
      return metadata == null ? null : [fieldId, metadata] as const
    })
    .filter((entry): entry is readonly [string, SoftphoneMetadataValues] => entry != null)

  return metadataEntries.length > 0 ? Object.fromEntries(metadataEntries) : undefined
}

function parseLegacyCaseValueRecord(record: Record<string, unknown>): Record<string, SoftphoneScenarioValue> {
  const debtor =
    record.debtor != null && typeof record.debtor === 'object' && !Array.isArray(record.debtor)
      ? record.debtor as Record<string, unknown>
      : {}
  const address =
    debtor.adresse != null && typeof debtor.adresse === 'object' && !Array.isArray(debtor.adresse)
      ? debtor.adresse as Record<string, unknown>
      : {}

  return {
    aktenzeichen: normalizeScenarioValue(record.aktenzeichen),
    case_status: normalizeScenarioValue(record.case_status),
    geburtsdatum: normalizeScenarioValue(debtor.geburtsdatum),
    hausnummer: normalizeScenarioValue(address.hausnummer),
    nachname: normalizeScenarioValue(debtor.nachname),
    ort: normalizeScenarioValue(address.ort),
    plz: normalizeScenarioValue(address.plz),
    strasse: normalizeScenarioValue(address.strasse),
    vorname: normalizeScenarioValue(debtor.vorname),
  }
}

function parseCaseDataRecord(record: Record<string, unknown>): SoftphoneCaseDataPayload {
  const metadata = parseFieldMetadataMap(record.metadata ?? record.fieldMetadata)

  if (record.values != null && typeof record.values === 'object' && !Array.isArray(record.values)) {
    return {
      metadata,
      values: parseValueRecord(record.values as Record<string, unknown>),
    }
  }

  return {
    metadata,
    values: parseLegacyCaseValueRecord(record),
  }
}

export async function readJsonBody(request: Request): Promise<ParseResult<unknown>> {
  // Requiring the JSON content type blocks cross-site form posts (which can
  // only send simple content types without a CORS preflight) from reaching
  // cookie-authenticated state-changing endpoints.
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('application/json')) {
    return fail('Content-Type must be application/json.')
  }

  try {
    return ok(await request.json())
  } catch {
    return fail('Invalid JSON body.')
  }
}

export function parseSoftphoneCaseDataPayload(value: unknown): ParseResult<SoftphoneCaseDataPayload> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  return ok(parseCaseDataRecord(value as Record<string, unknown>))
}

export function parseSoftphoneCaseDataRecognizedPayload(value: unknown): ParseResult<SoftphoneCaseDataPayload> {
  return parseSoftphoneCaseDataPayload(value)
}

export function parseSoftphoneRawTextPayload(value: unknown): ParseResult<SoftphoneTextPayload> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  const record = value as Record<string, unknown>

  return ok({
    text: normalizeNullableString(record.text ?? record.rawText),
  })
}

export function parseSoftphoneDebugInformationPayload(value: unknown): ParseResult<SoftphoneTextPayload> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  const record = value as Record<string, unknown>
  const debugInformation = record.debugInformation ?? record.text
  const normalizedText =
    typeof debugInformation === 'string'
      ? normalizeNullableString(debugInformation)
      : debugInformation == null
        ? null
        : normalizeNullableString(JSON.stringify(debugInformation, null, 2))

  return ok({
    text: normalizedText,
  })
}

export function parseSoftphoneIntentPayload(value: unknown): ParseResult<SoftphoneIntentPayload> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  const record = value as Record<string, unknown>
  const intents = Array.isArray(record.intents)
    ? record.intents.map((intent) => normalizeNullableString(intent)).filter((intent): intent is string => intent != null)
    : typeof record.intent === 'string'
      ? record.intent.split(',').map((intent) => intent.trim()).filter((intent) => intent.length > 0)
      : []

  return ok({
    intents: Array.from(new Set(intents)),
  })
}

export function parseSoftphoneCasePhasePayload(
  value: unknown,
  validPhaseIds?: readonly string[],
): ParseResult<SoftphoneCasePhaseEvent> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  const record = value as Record<string, unknown>
  const normalizedPhase = normalizeNullableString(record.phaseId ?? record.phase)

  if (normalizedPhase == null) {
    return fail('phaseId is required.')
  }

  if (validPhaseIds != null && !validPhaseIds.includes(normalizedPhase)) {
    return fail(`phaseId must be one of: ${validPhaseIds.join(', ')}.`)
  }

  return ok({
    metadata: parseMetadataValues(record.metadata ?? record.phaseMetadata),
    phaseId: normalizedPhase,
    timestamp: normalizeIsoTimestamp(record.timestamp ?? record.occurredAt),
  })
}

export function parseSoftphoneIvrEventEnvelope(
  value: unknown,
  validPhaseIds?: readonly string[],
): ParseResult<SoftphoneIvrEventEnvelope> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('payload must be an object.')
  }

  const record = value as Record<string, unknown>
  const normalizedType = normalizeNullableString(record.type)

  if (normalizedType == null || !SOFTPHONE_IVR_EVENT_TYPES.includes(normalizedType as typeof SOFTPHONE_IVR_EVENT_TYPES[number])) {
    return fail(`type must be one of: ${SOFTPHONE_IVR_EVENT_TYPES.join(', ')}.`)
  }

  const timestamp = normalizeIsoTimestamp(record.timestamp)
  const data = record.data

  if (normalizedType === 'case_data') {
    const parsed = parseSoftphoneCaseDataPayload(data)
    return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'case_data' }) : parsed
  }

  if (normalizedType === 'recognized_fields') {
    const parsed = parseSoftphoneCaseDataRecognizedPayload(data)
    return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'recognized_fields' }) : parsed
  }

  if (normalizedType === 'raw_text') {
    const parsed = parseSoftphoneRawTextPayload(data)
    return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'raw_text' }) : parsed
  }

  if (normalizedType === 'debug') {
    const parsed = parseSoftphoneDebugInformationPayload(data)
    return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'debug' }) : parsed
  }

  if (normalizedType === 'intent') {
    const parsed = parseSoftphoneIntentPayload(data)
    return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'intent' }) : parsed
  }

  const parsed = parseSoftphoneCasePhasePayload(data, validPhaseIds)
  return parsed.ok ? ok({ data: parsed.value, timestamp, type: 'phase' }) : parsed
}
