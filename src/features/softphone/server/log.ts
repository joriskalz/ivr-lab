import { hostname } from 'node:os'
import type { SoftphoneCaseDataPayload, SoftphoneCasePhaseEvent, SoftphoneTextPayload } from '@/features/softphone/types'

const SOFTPHONE_LOG_PREFIX = '[softphone]'
const INSTANCE_ID = `${hostname()}:${process.pid}`

function toJson(value: Record<string, unknown>) {
  return JSON.stringify({
    instance: INSTANCE_ID,
    ...value,
  })
}

export function logSoftphoneInfo(event: string, details: Record<string, unknown>) {
  console.info(`${SOFTPHONE_LOG_PREFIX} ${event} ${toJson(details)}`)
}

export function logSoftphoneWarn(event: string, details: Record<string, unknown>) {
  console.warn(`${SOFTPHONE_LOG_PREFIX} ${event} ${toJson(details)}`)
}

export function describeCasePayload(payload: SoftphoneCaseDataPayload) {
  return {
    fieldCount: Object.keys(payload.values).length,
    preview: Object.entries(payload.values).slice(0, 6),
  }
}

export function describeTextPayload(payload: SoftphoneTextPayload) {
  return {
    hasText: typeof payload.text === 'string' && payload.text.trim().length > 0,
    preview: typeof payload.text === 'string' ? payload.text.trim().slice(0, 120) : null,
    textLength: typeof payload.text === 'string' ? payload.text.length : 0,
  }
}

export function describePhaseEvent(payload: SoftphoneCasePhaseEvent) {
  return {
    phaseId: payload.phaseId,
    timestamp: payload.timestamp,
  }
}
