import { useCallback, useEffect, useRef, useState } from 'react'
import { requestSoftphoneAcsToken } from '@/features/softphone/client'
import {
  createSoftphoneDisconnectDiagnostic,
  createSoftphoneOperationErrorDiagnostic,
  type SoftphoneCallDiagnosticContext,
  type SoftphoneCallEndReason,
} from '@/features/softphone/softphone-call-diagnostics'
import type { SoftphoneProfile } from '@/features/softphone/types'

type SoftphoneCallState = 'adding' | 'ending' | 'idle' | 'starting'

type SoftphoneCallEvent = 'isMutedChanged' | 'stateChanged'

type SoftphoneSdkDtmfTone =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'Flash'
  | 'Num0'
  | 'Num1'
  | 'Num2'
  | 'Num3'
  | 'Num4'
  | 'Num5'
  | 'Num6'
  | 'Num7'
  | 'Num8'
  | 'Num9'
  | 'Pound'
  | 'Star'

type SoftphoneCallApi = {
  callConnectionId?: string
  callEndReason?: SoftphoneCallEndReason
  hangUp: () => Promise<void>
  id?: string
  isMuted: boolean
  off?: (event: SoftphoneCallEvent, listener: () => void) => void
  on: (event: SoftphoneCallEvent, listener: () => void) => void
  sendDtmf?: (tone: SoftphoneSdkDtmfTone) => Promise<void>
  state: string
  mute?: () => Promise<void>
  unmute?: () => Promise<void>
}

type SoftphoneCallAgentApi = {
  dispose: () => Promise<void>
  startCall: (
    callees: Array<{ phoneNumber: string }>,
    options?: {
      alternateCallerId?: {
        phoneNumber: string
      }
    },
  ) => Promise<SoftphoneCallApi>
}

type SoftphoneDeviceManagerApi = {
  askDevicePermission: (constraints: { audio: boolean; video: boolean }) => Promise<{ audio: boolean }>
}

type SoftphoneCallClientApi = {
  createCallAgent: (
    credential: unknown,
    options: {
      displayName: string
    },
  ) => Promise<SoftphoneCallAgentApi>
  getDeviceManager: () => Promise<SoftphoneDeviceManagerApi>
}

type SoftphoneCallingModuleApi = {
  CallClient: new () => SoftphoneCallClientApi
}

type SoftphoneTokenModuleApi = {
  AzureCommunicationTokenCredential: new (token: string) => unknown
}

type CallListenerRef = {
  call: SoftphoneCallApi
  event: SoftphoneCallEvent
  listener: () => void
}

export type SoftphoneDtmfTone = '#' | '*' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

export interface SoftphoneSessionResult {
  activeCallState: string
  callIdentifier: string
  callState: SoftphoneCallState
  errorDetails: string
  endCall: () => Promise<void>
  errorMessage: string
  hasActiveCall: boolean
  isBusy: boolean
  isCallConnectedState: boolean
  isMicMuted: boolean
  sendDtmfTone: (tone: SoftphoneDtmfTone) => Promise<void>
  startCall: () => Promise<void>
  statusMessage: string
  toggleMute: () => Promise<void>
}

const E164_PHONE_PATTERN = /^\+[1-9]\d{1,14}$/
const DTMF_TONE_SEND_DELAY_MS = 160

const ACS_DTMF_TONE_BY_SOFTPHONE_TONE: Record<SoftphoneDtmfTone, SoftphoneSdkDtmfTone> = {
  '#': 'Pound',
  '*': 'Star',
  '0': 'Num0',
  '1': 'Num1',
  '2': 'Num2',
  '3': 'Num3',
  '4': 'Num4',
  '5': 'Num5',
  '6': 'Num6',
  '7': 'Num7',
  '8': 'Num8',
  '9': 'Num9',
}

function normalizePhoneNumber(value: string) {
  return value.trim().replace(/[\s().-]/g, '')
}

function ensureValidPhone(value: string, label: string) {
  const normalizedValue = normalizePhoneNumber(value)

  if (!E164_PHONE_PATTERN.test(normalizedValue)) {
    throw new Error(`${label} must use E.164 format.`)
  }

  return normalizedValue
}

function normalizeCallState(value: string) {
  return value.trim().toLowerCase()
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function resolveCallIdentifier(call: SoftphoneCallApi) {
  return call.callConnectionId?.trim() || call.id?.trim() || ''
}

export function useSoftphoneSession(activeProfile: SoftphoneProfile | null, sessionId: string): SoftphoneSessionResult {
  const [activeCallState, setActiveCallState] = useState('')
  const [callIdentifier, setCallIdentifier] = useState('')
  const [callState, setCallState] = useState<SoftphoneCallState>('idle')
  const [errorDetails, setErrorDetails] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [hasActiveCall, setHasActiveCall] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Ready to place a call.')
  const callAgentRef = useRef<SoftphoneCallAgentApi | null>(null)
  const callListenerRefs = useRef<CallListenerRef[]>([])
  const callRef = useRef<SoftphoneCallApi | null>(null)
  const dtmfSendChainRef = useRef<Promise<void>>(Promise.resolve())

  const isCallConnectedState = normalizeCallState(activeCallState) === 'connected'
  const isBusy = callState !== 'idle'

  const clearCallListeners = useCallback(() => {
    callListenerRefs.current.forEach(({ call, event, listener }) => {
      call.off?.(event, listener)
    })
    callListenerRefs.current = []
  }, [])

  const disposeCallResources = useCallback(async (nextStatusMessage?: string) => {
    clearCallListeners()

    const activeAgent = callAgentRef.current
    callAgentRef.current = null
    callRef.current = null
    dtmfSendChainRef.current = Promise.resolve()

    setActiveCallState('')
    setCallIdentifier('')
    setCallState('idle')
    setHasActiveCall(false)
    setIsMicMuted(false)

    if (nextStatusMessage) {
      setStatusMessage(nextStatusMessage)
    }

    if (activeAgent != null) {
      await activeAgent.dispose().catch(() => {})
    }
  }, [clearCallListeners])

  useEffect(() => {
    return () => {
      const activeCall = callRef.current
      void (async () => {
        if (activeCall != null) {
          await activeCall.hangUp().catch(() => {})
        }
        await disposeCallResources().catch(() => {})
      })()
    }
  }, [disposeCallResources])

  useEffect(() => {
    setErrorDetails('')
    setErrorMessage('')

    if (callRef.current == null) {
      setStatusMessage('Ready to place a call.')
    }
  }, [sessionId])

  const buildDiagnosticContext = useCallback((call?: SoftphoneCallApi | null): SoftphoneCallDiagnosticContext => ({
    callIdentifier: call == null ? '' : resolveCallIdentifier(call),
    callerId: activeProfile?.alternateCallerId ?? '',
    destination: activeProfile?.primaryPhoneNumber ?? '',
    profileId: activeProfile?.id ?? '',
    profileName: activeProfile?.name ?? '',
    sessionId,
    userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
  }), [activeProfile, sessionId])

  const registerCallListeners = useCallback((activeCall: SoftphoneCallApi) => {
    const register = (event: SoftphoneCallEvent, listener: () => void) => {
      activeCall.on(event, listener)
      callListenerRefs.current.push({ call: activeCall, event, listener })
    }

    register('isMutedChanged', () => {
      setIsMicMuted(activeCall.isMuted)
    })

    register('stateChanged', () => {
      const nextState = activeCall.state
      setActiveCallState(nextState)
      setCallIdentifier(resolveCallIdentifier(activeCall))
      setStatusMessage(`Call state: ${nextState}.`)

      if (normalizeCallState(nextState) === 'disconnected') {
        const diagnostic = createSoftphoneDisconnectDiagnostic({
          context: buildDiagnosticContext(activeCall),
          endReason: activeCall.callEndReason,
          state: nextState,
        })

        console.error('[softphone] ACS call disconnected.', diagnostic.details)
        setErrorDetails(diagnostic.details)
        setErrorMessage(diagnostic.message)
        void disposeCallResources('Call disconnected.')
      }
    })
  }, [buildDiagnosticContext, disposeCallResources])

  const startCall = useCallback(async () => {
    if (activeProfile == null || isBusy) {
      return
    }

    setCallState('starting')
    setErrorDetails('')
    setErrorMessage('')
    setStatusMessage('Requesting ACS token...')

    try {
      const normalizedPrimaryPhoneNumber = ensureValidPhone(activeProfile.primaryPhoneNumber, 'Primary phone number')
      const normalizedAlternateCallerId = ensureValidPhone(activeProfile.alternateCallerId, 'Alternate caller ID')
      const tokenPayload = await requestSoftphoneAcsToken(activeProfile.id, sessionId)
      const [commonModule, callingModule] = await Promise.all([
        import('@azure/communication-common') as Promise<SoftphoneTokenModuleApi>,
        import('@azure/communication-calling') as unknown as Promise<SoftphoneCallingModuleApi>,
      ])
      const credential = new commonModule.AzureCommunicationTokenCredential(tokenPayload.token)
      const callClient = new callingModule.CallClient()
      const deviceManager = await callClient.getDeviceManager()
      const permissions = await deviceManager.askDevicePermission({
        audio: true,
        video: false,
      })

      if (!permissions.audio) {
        throw new Error('Microphone permission is required for the browser softphone.')
      }

      const callAgent = await callClient.createCallAgent(credential, {
        displayName: activeProfile.name,
      })
      const activeCall = await callAgent.startCall(
        [{ phoneNumber: normalizedPrimaryPhoneNumber }],
        {
          alternateCallerId: {
            phoneNumber: normalizedAlternateCallerId,
          },
        },
      )

      callAgentRef.current = callAgent
      callRef.current = activeCall
      registerCallListeners(activeCall)

      setActiveCallState(activeCall.state)
      setCallIdentifier(resolveCallIdentifier(activeCall))
      setHasActiveCall(true)
      setIsMicMuted(activeCall.isMuted)
      setStatusMessage(`Dialing ${normalizedPrimaryPhoneNumber}...`)
    } catch (error) {
      const diagnostic = createSoftphoneOperationErrorDiagnostic({
        context: buildDiagnosticContext(callRef.current),
        error,
        operation: 'start the call',
      })

      await disposeCallResources()
      console.error('[softphone] Unable to start ACS call.', diagnostic.details)
      setErrorDetails(diagnostic.details)
      setErrorMessage(diagnostic.message)
      setStatusMessage('Softphone idle.')
    } finally {
      setCallState('idle')
    }
  }, [activeProfile, buildDiagnosticContext, disposeCallResources, isBusy, registerCallListeners, sessionId])

  const endCall = useCallback(async () => {
    const activeCall = callRef.current

    if (activeCall == null || isBusy) {
      return
    }

    setCallState('ending')
    setErrorDetails('')
    setErrorMessage('')
    setStatusMessage('Ending call...')

    try {
      await activeCall.hangUp()
    } catch (error) {
      const diagnostic = createSoftphoneOperationErrorDiagnostic({
        context: buildDiagnosticContext(activeCall),
        error,
        operation: 'end the call',
      })
      setErrorDetails(diagnostic.details)
      setErrorMessage(diagnostic.message)
    } finally {
      await disposeCallResources('Call ended.')
    }
  }, [buildDiagnosticContext, disposeCallResources, isBusy])

  const toggleMute = useCallback(async () => {
    const activeCall = callRef.current

    if (activeCall == null || isBusy) {
      return
    }

    try {
      if (activeCall.isMuted) {
        await activeCall.unmute?.()
        setStatusMessage('Microphone unmuted.')
      } else {
        await activeCall.mute?.()
        setStatusMessage('Microphone muted.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to toggle mute.')
    }
  }, [isBusy])

  const sendDtmfTone = useCallback(async (tone: SoftphoneDtmfTone) => {
    const activeCall = callRef.current

    if (activeCall == null || isBusy || !isCallConnectedState) {
      return
    }

    const sdkTone = ACS_DTMF_TONE_BY_SOFTPHONE_TONE[tone]

    dtmfSendChainRef.current = dtmfSendChainRef.current.then(async () => {
      try {
        await activeCall.sendDtmf?.(sdkTone)
        setStatusMessage(`Sent DTMF ${tone}.`)
        await wait(DTMF_TONE_SEND_DELAY_MS)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to send DTMF.')
      }
    })

    await dtmfSendChainRef.current
  }, [isBusy, isCallConnectedState])

  return {
    activeCallState,
    callIdentifier,
    callState,
    errorDetails,
    endCall,
    errorMessage,
    hasActiveCall,
    isBusy,
    isCallConnectedState,
    isMicMuted,
    sendDtmfTone,
    startCall,
    statusMessage,
    toggleMute,
  }
}
