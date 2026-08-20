export interface SoftphoneProfile {
  alternateCallerId: string
  id: string
  name: string
  primaryPhoneNumber: string
  titleText?: string
}

export type SoftphoneProfileSnapshot = SoftphoneProfile

export interface SoftphoneScenarioProfileConfig extends SoftphoneProfile {
  acsAccessKey: string
  acsEndpoint: string
}

export const SOFTPHONE_SCENARIO_FIELD_TYPES = ['text', 'number', 'date', 'enum', 'boolean'] as const

export type SoftphoneScenarioFieldType = (typeof SOFTPHONE_SCENARIO_FIELD_TYPES)[number]

export interface SoftphoneScenarioPhase {
  id: string
  label: string
}

export interface SoftphoneScenarioRecognizedField {
  generatorValues: string[]
  id: string
  label: string
  phaseId: string
  type: SoftphoneScenarioFieldType
}

export interface SoftphoneScenarioFeatures {
  debugInformation: boolean
  intents: boolean
  phases: boolean
  rawText: boolean
  recognizedData: boolean
}

export interface SoftphoneScenarioConfig {
  brandColor: string
  features: SoftphoneScenarioFeatures
  phases: SoftphoneScenarioPhase[]
  profiles: SoftphoneScenarioProfileConfig[]
  recognizedFields: SoftphoneScenarioRecognizedField[]
}

export interface SoftphoneScenarioSnapshotConfig {
  brandColor: string
  features: SoftphoneScenarioFeatures
  phases: SoftphoneScenarioPhase[]
  profiles: SoftphoneProfile[]
  recognizedFields: SoftphoneScenarioRecognizedField[]
}

export interface SoftphoneTestScenarioRecord {
  accessKey: string
  config: SoftphoneScenarioConfig
  createdAt: string
  id: string
  name: string
  updatedAt: string
}

export interface SoftphoneScenarioSnapshot {
  config: SoftphoneScenarioSnapshotConfig
  createdAt: string
  id: string
  name: string
  updatedAt: string
}

export type SoftphoneScenarioValue = boolean | number | string | null

export interface SoftphoneMetadataValues {
  values: Record<string, SoftphoneScenarioValue>
}

export interface SoftphoneFieldMetadataMap {
  [fieldId: string]: SoftphoneMetadataValues
}

export interface SoftphoneCaseDataPayload {
  metadata?: SoftphoneFieldMetadataMap
  values: Record<string, SoftphoneScenarioValue>
}

export interface SoftphoneTextPayload {
  text: string | null
}

export interface SoftphoneIntentPayload {
  intents: string[]
}

export interface SoftphoneCasePhaseEvent {
  metadata?: SoftphoneMetadataValues
  phaseId: string
  timestamp: string
}

export interface SoftphoneCaseState {
  caseData: SoftphoneCaseDataPayload | null
  debugInformation: SoftphoneTextPayload | null
  intents: string[]
  ivrRawText: SoftphoneTextPayload | null
  phaseEvents: SoftphoneCasePhaseEvent[]
  recognizedData: SoftphoneCaseDataPayload | null
  updatedAt: string | null
}

export interface SoftphoneBootstrapPayload {
  caseState: SoftphoneCaseState
  correlationCode: string
  profiles: SoftphoneProfile[]
  scenario: SoftphoneScenarioSnapshot
  sessionId: string
}

export interface SoftphoneScenarioAccessPreview {
  brandColor: string
  id: string
  name: string
}

export interface SoftphoneAcsTokenPayload {
  expiresAt: string
  token: string
}

export interface SoftphoneExternalEndpointBundle {
  caseGetUrl: string
  caseSetUrl: string
  correlationHeaderName: string
  correlationHeaderValue: string
  debugInformationSetUrl: string
  eventSetUrl: string
  headerName: string
  headerValue: string
  ivrRawTextSetUrl: string
  ivrRecognizedSetUrl: string
  phaseSetUrl: string
}

export const SOFTPHONE_IVR_EVENT_TYPES = [
  'case_data',
  'debug',
  'intent',
  'phase',
  'raw_text',
  'recognized_fields',
] as const

export type SoftphoneIvrEventType = (typeof SOFTPHONE_IVR_EVENT_TYPES)[number]

export interface SoftphoneCaseDataEventPayload {
  values: Record<string, SoftphoneScenarioValue>
}

export interface SoftphoneDebugEventPayload {
  text: string | null
}

export interface SoftphoneIntentEventPayload {
  intents: string[]
}

export interface SoftphonePhaseEventPayload {
  metadata?: SoftphoneMetadataValues
  phaseId: string
}

export interface SoftphoneRawTextEventPayload {
  text: string | null
}

export interface SoftphoneRecognizedFieldsEventPayload {
  metadata?: SoftphoneFieldMetadataMap
  values: Record<string, SoftphoneScenarioValue>
}

export type SoftphoneIvrEventDataByType = {
  case_data: SoftphoneCaseDataEventPayload
  debug: SoftphoneDebugEventPayload
  intent: SoftphoneIntentEventPayload
  phase: SoftphonePhaseEventPayload
  raw_text: SoftphoneRawTextEventPayload
  recognized_fields: SoftphoneRecognizedFieldsEventPayload
}

export type SoftphoneIvrEventEnvelope =
  {
    timestamp?: string
  } & {
    [K in SoftphoneIvrEventType]: {
      data: SoftphoneIvrEventDataByType[K]
      type: K
    }
  }[SoftphoneIvrEventType]
