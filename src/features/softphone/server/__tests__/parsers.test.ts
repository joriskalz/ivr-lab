import { describe, expect, test } from 'bun:test'
import {
  parseSoftphoneCaseDataPayload,
  parseSoftphoneIvrEventEnvelope,
} from '@/features/softphone/server/parsers'
import { generateScenarioCaseData, normalizeSoftphoneScenarioConfig } from '@/features/softphone/scenario'

describe('softphone parser helpers', () => {
  test('parses map-based case payloads', () => {
    const result = parseSoftphoneCaseDataPayload({
      values: {
        city: 'Berlin',
        isVip: true,
        score: 42,
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.values).toEqual({
        city: 'Berlin',
        isVip: true,
        score: 42,
      })
    }
  })

  test('parses unified recognized-fields events', () => {
    const result = parseSoftphoneIvrEventEnvelope({
      data: {
        metadata: {
          city: {
            score: 91,
          },
          postalCode: {
            isMatch: true,
          },
        },
        values: {
          city: 'Berlin',
          postalCode: '10115',
        },
      },
      timestamp: '2026-03-15T10:00:00.000Z',
      type: 'recognized_fields',
    }, ['greeting', 'verification'])

    expect(result.ok).toBe(true)
    if (result.ok && result.value.type === 'recognized_fields') {
      expect(result.value.type).toBe('recognized_fields')
      expect(result.value.data.values.city).toBe('Berlin')
      expect(result.value.data.metadata?.city?.values.score).toBe(91)
      expect(result.value.data.metadata?.postalCode?.values.isMatch).toBe(true)
    }
  })

  test('parses phase metadata from unified phase events', () => {
    const result = parseSoftphoneIvrEventEnvelope({
      data: {
        metadata: {
          confidence: 'high',
          score: 98,
        },
        phaseId: 'verification',
      },
      type: 'phase',
    }, ['greeting', 'verification'])

    expect(result.ok).toBe(true)
    if (result.ok && result.value.type === 'phase') {
      expect(result.value.data.phaseId).toBe('verification')
      expect(result.value.data.metadata?.values.score).toBe(98)
      expect(result.value.data.metadata?.values.confidence).toBe('high')
    }
  })

  test('rejects invalid unified event types', () => {
    const result = parseSoftphoneIvrEventEnvelope({
      data: {},
      type: 'unknown',
    })

    expect(result).toEqual({
      issues: ['type must be one of: case_data, debug, intent, phase, raw_text, recognized_fields.'],
      ok: false,
    })
  })

  test('rejects phase events that reference an unknown configured phase', () => {
    const result = parseSoftphoneIvrEventEnvelope({
      data: {
        phaseId: 'missing_phase',
      },
      type: 'phase',
    }, ['greeting', 'verification'])

    expect(result).toEqual({
      issues: ['phaseId must be one of: greeting, verification.'],
      ok: false,
    })
  })

  test('normalizes plz scenario fields to text so leading zeros are preserved', () => {
    const config = normalizeSoftphoneScenarioConfig({
      recognizedFields: [
        {
          generatorValues: ['04109'],
          id: 'plz',
          label: 'PLZ',
          phaseId: 'verification',
          type: 'number',
        },
      ],
      phases: [{ id: 'verification', label: 'Verification' }],
    })

    expect(config.recognizedFields[0]?.type).toBe('text')
    expect(generateScenarioCaseData(config).plz).toBe('04109')
  })
})
