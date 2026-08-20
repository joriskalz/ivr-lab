export interface SoftphoneCallEndReason {
  code?: number
  message?: string
  resultCategories?: string[]
  subCode?: number
  [key: string]: unknown
}

export interface SoftphoneCallDiagnosticContext {
  callIdentifier: string
  callerId: string
  destination: string
  profileId: string
  profileName: string
  sessionId: string
  userAgent?: string
}

export interface SoftphoneCallDiagnostic {
  details: string
  message: string
}

function toSerializableValue(value: unknown) {
  const seenValues = new WeakSet<object>()
  const serializedValue = JSON.stringify(value, (_key, currentValue: unknown) => {
    if (typeof currentValue === 'bigint') {
      return currentValue.toString()
    }

    if (currentValue instanceof Error) {
      return {
        message: currentValue.message,
        name: currentValue.name,
        stack: currentValue.stack,
      }
    }

    if (currentValue != null && typeof currentValue === 'object') {
      if (seenValues.has(currentValue)) {
        return '[Circular]'
      }

      seenValues.add(currentValue)
    }

    return currentValue
  })

  return serializedValue == null ? null : JSON.parse(serializedValue) as unknown
}

function formatDiagnosticDetails(value: unknown) {
  return JSON.stringify(toSerializableValue(value), null, 2)
}

function formatEndReasonSummary(reason?: SoftphoneCallEndReason) {
  const code = typeof reason?.code === 'number' ? String(reason.code) : 'unknown'
  const subCode = typeof reason?.subCode === 'number' ? String(reason.subCode) : 'unknown'
  const message = reason?.message?.trim()

  return `ACS disconnected the call (code ${code}, subcode ${subCode})${message ? `: ${message}` : '.'}`
}

export function createSoftphoneDisconnectDiagnostic(input: {
  context: SoftphoneCallDiagnosticContext
  endReason?: SoftphoneCallEndReason
  occurredAt?: string
  state: string
}): SoftphoneCallDiagnostic {
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  return {
    details: formatDiagnosticDetails({
      call: {
        callerId: input.context.callerId,
        destination: input.context.destination,
        identifier: input.context.callIdentifier || null,
        state: input.state,
      },
      endReason: input.endReason == null ? null : toSerializableValue(input.endReason),
      occurredAt,
      operation: 'stateChanged',
      profile: {
        id: input.context.profileId,
        name: input.context.profileName,
      },
      sessionId: input.context.sessionId,
      userAgent: input.context.userAgent ?? null,
    }),
    message: formatEndReasonSummary(input.endReason),
  }
}

export function createSoftphoneOperationErrorDiagnostic(input: {
  context: SoftphoneCallDiagnosticContext
  error: unknown
  occurredAt?: string
  operation: string
}): SoftphoneCallDiagnostic {
  const fallbackMessage = `Unable to ${input.operation}.`
  const message = input.error instanceof Error ? input.error.message : fallbackMessage

  return {
    details: formatDiagnosticDetails({
      call: {
        callerId: input.context.callerId,
        destination: input.context.destination,
        identifier: input.context.callIdentifier || null,
      },
      error: toSerializableValue(input.error),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      operation: input.operation,
      profile: {
        id: input.context.profileId,
        name: input.context.profileName,
      },
      sessionId: input.context.sessionId,
      userAgent: input.context.userAgent ?? null,
    }),
    message,
  }
}
