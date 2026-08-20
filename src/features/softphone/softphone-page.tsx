import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RegisterableHotkey } from '@tanstack/hotkeys'
import {
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FlaskConical,
  Grip,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Mic,
  MicOff,
  Moon,
  PhoneCall,
  PhoneOff,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSoftphoneScenarioAccessStore } from '@/features/softphone/access-store'
import {
  createSoftphoneCaseEventSource,
  fetchSoftphoneCaseState,
  fetchSoftphoneExternalEndpoints,
  fetchSoftphoneScenarioPreview,
  setSoftphoneCaseData,
  unlockSoftphone,
} from '@/features/softphone/client'
import { getViewerRouteAccess } from '@/features/auth/access'
import { generateSoftphoneCaseDataPayload } from '@/features/softphone/case-data-generator'
import { formatSoftphoneDuration, type SoftphoneCallFeedback } from '@/features/softphone/call-history'
import { SoftphoneAboutContent, SoftphoneInformationSurface } from '@/features/softphone/softphone-information'
import { formatScenarioValue } from '@/features/softphone/scenario'
import { buildSoftphoneBrandVariables, DEFAULT_SOFTPHONE_BRAND_COLOR, withAlpha } from '@/features/softphone/theme'
import { useSoftphoneCallHistory } from '@/features/softphone/use-softphone-call-history'
import type {
  SoftphoneCaseState,
  SoftphoneExternalEndpointBundle,
  SoftphoneMetadataValues,
  SoftphoneProfile,
  SoftphoneScenarioAccessPreview,
  SoftphoneScenarioSnapshot,
  SoftphoneScenarioValue,
} from '@/features/softphone/types'
import { useSoftphoneSession, type SoftphoneDtmfTone } from '@/features/softphone/use-softphone-session'
import { cn } from '@/lib/utils'

const DTMF_ROWS: SoftphoneDtmfTone[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]
const SOFTPHONE_HOTKEY_EXCLUDE_SELECTOR = '[data-softphone-hotkey-exclude="true"]'
const SOFTPHONE_ACTION_HOTKEY_EXCLUDE_SELECTOR = '[data-softphone-action-hotkey-exclude="true"]'
const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const
const DTMF_KEYPAD_TONE_DURATION_MS = 120
const DTMF_FREQUENCIES_BY_TONE: Record<SoftphoneDtmfTone, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
}

type SyncState = 'error' | 'idle' | 'syncing' | 'synced'
type DataFontSize = 'l' | 'm' | 's' | 'xl' | 'xs'
type SoftphoneThemeMode = 'dark' | 'light'

const DATA_FONT_SIZE_OPTIONS: Array<{
  description: string
  label: string
  value: DataFontSize
}> = [
  { description: 'Most compact data view.', label: 'XS', value: 'xs' },
  { description: 'Small table and transcript text.', label: 'S', value: 's' },
  { description: 'Default data size.', label: 'M', value: 'm' },
  { description: 'Larger table and transcript text.', label: 'L', value: 'l' },
  { description: 'Largest data size.', label: 'XL', value: 'xl' },
]

function resolveDataFontScale(size: DataFontSize) {
  switch (size) {
    case 'xs':
      return {
        body: 'text-xs',
        code: 'text-[10px] leading-5',
        emphasis: 'text-sm',
        table: 'text-sm',
      }
    case 's':
      return {
        body: 'text-sm',
        code: 'text-[11px] leading-6',
        emphasis: 'text-base',
        table: 'text-[0.95rem]',
      }
    case 'l':
      return {
        body: 'text-lg',
        code: 'text-sm leading-7',
        emphasis: 'text-xl',
        table: 'text-[1.05rem]',
      }
    case 'xl':
      return {
        body: 'text-xl',
        code: 'text-base leading-8',
        emphasis: 'text-2xl',
        table: 'text-[1.15rem]',
      }
    case 'm':
    default:
      return {
        body: 'text-base',
        code: 'text-xs leading-6',
        emphasis: 'text-lg',
        table: 'text-base',
      }
  }
}

function resolveIntentBadgeScale(size: DataFontSize) {
  switch (size) {
    case 'xs':
      return 'px-2.5 py-1 text-[0.68rem]'
    case 's':
      return 'px-3 py-1 text-xs'
    case 'l':
      return 'px-3.5 py-1.5 text-base'
    case 'xl':
      return 'px-4 py-1.5 text-lg'
    case 'm':
    default:
      return 'px-3 py-1.5 text-sm'
  }
}

function resolveAudioContextClass() {
  const audioContextGlobal = globalThis as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }

  return audioContextGlobal.AudioContext ?? audioContextGlobal.webkitAudioContext ?? null
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]',
  ) != null
}

function isWithinSoftphoneHotkeyExclusion(target: EventTarget | null) {
  return target instanceof Element && target.closest(SOFTPHONE_HOTKEY_EXCLUDE_SELECTOR) != null
}

function isWithinSoftphoneActionHotkeyExclusion(target: EventTarget | null) {
  return target instanceof Element && target.closest(SOFTPHONE_ACTION_HOTKEY_EXCLUDE_SELECTOR) != null
}

function shouldHandleSoftphoneHotkey(event: KeyboardEvent) {
  return !isEditableKeyboardTarget(event.target) && !isWithinSoftphoneHotkeyExclusion(event.target)
}

function shouldHandleSoftphoneActionHotkey(event: KeyboardEvent) {
  return shouldHandleSoftphoneHotkey(event) && !isWithinSoftphoneActionHotkeyExclusion(event.target)
}

function useSoftphoneRouteHotkey(
  hotkey: RegisterableHotkey,
  onTrigger: () => void,
  options: {
    enabled: boolean
    shouldHandle?: (event: KeyboardEvent) => boolean
  },
) {
  useHotkey(hotkey, (event) => {
    if (event.repeat || !(options.shouldHandle ?? shouldHandleSoftphoneHotkey)(event)) {
      return
    }

    onTrigger()
  }, {
    enabled: options.enabled,
    requireReset: true,
  })
}

function useSoftphoneDtmfHotkeys(enabled: boolean, onTone: (tone: SoftphoneDtmfTone) => void) {
  useSoftphoneRouteHotkey('1', () => onTone('1'), { enabled })
  useSoftphoneRouteHotkey('2', () => onTone('2'), { enabled })
  useSoftphoneRouteHotkey('3', () => onTone('3'), { enabled })
  useSoftphoneRouteHotkey('4', () => onTone('4'), { enabled })
  useSoftphoneRouteHotkey('5', () => onTone('5'), { enabled })
  useSoftphoneRouteHotkey('6', () => onTone('6'), { enabled })
  useSoftphoneRouteHotkey('7', () => onTone('7'), { enabled })
  useSoftphoneRouteHotkey('8', () => onTone('8'), { enabled })
  useSoftphoneRouteHotkey('9', () => onTone('9'), { enabled })
  useSoftphoneRouteHotkey({ key: '*' }, () => onTone('*'), { enabled })
  useSoftphoneRouteHotkey('0', () => onTone('0'), { enabled })
  useSoftphoneRouteHotkey({ key: '#' }, () => onTone('#'), { enabled })
}

function maskPhoneNumber(value: string | null | undefined) {
  if (value == null) {
    return '-'
  }

  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    return '-'
  }

  const digitsOnly = trimmedValue.replace(/\D/g, '')
  if (digitsOnly.length <= 4) {
    return trimmedValue
  }

  const maskedDigits = `${digitsOnly.slice(0, 2)}xxx${digitsOnly.slice(-2)}`
  return trimmedValue.startsWith('+') ? `+${maskedDigits}` : maskedDigits
}

function formatPhaseTimestamp(value: string) {
  const timestamp = new Date(value)

  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
  }).format(timestamp)
}

function formatElapsedDuration(from: string, to: string) {
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null
  }

  return formatSoftphoneDuration(end - start)
}

function formatRecognizedComparisonValue(fieldId: string, value: SoftphoneScenarioValue) {
  const formattedValue = formatScenarioValue(value)

  if (fieldId !== 'aktenzeichen' || typeof value !== 'string') {
    return formattedValue
  }

  const normalizedValue = value.trim().replace(/\s+/g, '')
  const match = normalizedValue.match(/^([A-Za-z])(\d{12})$/)

  if (match == null) {
    return formattedValue
  }

  const [, prefix, digits] = match
  return `${prefix.toUpperCase()} ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`
}

function formatMetadataKey(key: string) {
  const normalizedKey = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  if (!normalizedKey) {
    return key
  }

  return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1)
}

function formatMetadataValue(value: SoftphoneScenarioValue) {
  return formatScenarioValue(value)
}

function areScenarioValuesEqual(leftValue: SoftphoneScenarioValue, rightValue: SoftphoneScenarioValue) {
  if (leftValue == null || rightValue == null) {
    return false
  }

  if (typeof leftValue === 'string' && typeof rightValue === 'string') {
    return leftValue.trim() === rightValue.trim()
  }

  return leftValue === rightValue
}

function resolveMetadataScore(metadata?: SoftphoneMetadataValues) {
  const directScore = metadata?.values.score

  if (typeof directScore === 'number' && Number.isFinite(directScore)) {
    return directScore
  }

  const fallbackScoreEntry = Object.entries(metadata?.values ?? {}).find(([key, value]) => {
    return key.toLowerCase().includes('score') && typeof value === 'number' && Number.isFinite(value)
  })

  return typeof fallbackScoreEntry?.[1] === 'number' ? fallbackScoreEntry[1] : null
}

function resolveMetadataMatch(metadata?: SoftphoneMetadataValues) {
  const directMatch = metadata?.values.isMatch ?? metadata?.values.is_match
  return typeof directMatch === 'boolean' ? directMatch : null
}

function resolveMetadataIndicatorClasses(metadata?: SoftphoneMetadataValues) {
  const score = resolveMetadataScore(metadata)
  const isMatch = resolveMetadataMatch(metadata)

  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 100) {
      return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
    }

    if (score >= 95) {
      return 'border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-300'
    }

    if (score >= 90) {
      return 'border-yellow-500/30 bg-yellow-500/12 text-yellow-600 dark:text-yellow-300'
    }

    if (score >= 80) {
      return 'border-orange-500/30 bg-orange-500/12 text-orange-600 dark:text-orange-300'
    }

    if (score >= 70) {
      return 'border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-300'
    }

    return 'border-red-700/40 bg-red-700/14 text-red-700 dark:text-red-300'
  }

  if (isMatch === false) {
    return 'border-red-500/30 bg-red-500/12 text-red-600 dark:text-red-300'
  }

  if (isMatch === true) {
    return 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
  }

  return 'border-border bg-muted/35 text-muted-foreground'
}

function resolveMetadataPriority(key: string) {
  switch (key) {
    case 'isMatch':
    case 'is_match':
      return 0
    case 'score':
      return 1
    case 'confidence':
      return 2
    case 'reason':
      return 99
    default:
      return 10
  }
}

function resolveMetadataEntries(metadata?: SoftphoneMetadataValues) {
  if (metadata == null) {
    return []
  }

  return Object.entries(metadata.values)
    .filter(([, value]) => value != null)
    .sort(([leftKey], [rightKey]) => {
      const priorityDifference = resolveMetadataPriority(leftKey) - resolveMetadataPriority(rightKey)

      return priorityDifference !== 0 ? priorityDifference : leftKey.localeCompare(rightKey)
    })
}

function resolveIntentBadges(intents: string[]) {
  return Array.from(
    new Set(
      intents.flatMap((intent) =>
        intent
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    ),
  )
}

function resolvePhaseProgress(
  scenario: SoftphoneScenarioSnapshot | null,
  caseState: SoftphoneCaseState | null,
) {
  const eventsById = new Map((caseState?.phaseEvents ?? []).map((event) => [event.phaseId, event]))
  const firstTimestamp = (caseState?.phaseEvents ?? []).at(0)?.timestamp ?? null

  return (scenario?.config.phases ?? []).map((phase, index) => {
    const event = eventsById.get(phase.id) ?? null
    const previousReached = index === 0
      ? true
      : (scenario?.config.phases ?? []).slice(0, index).every((candidate) => eventsById.has(candidate.id))
    const isComplete = event != null
    const isInProgress = !isComplete && previousReached

    return {
      elapsed: event != null && firstTimestamp != null ? formatElapsedDuration(firstTimestamp, event.timestamp) : null,
      event,
      isComplete,
      isInProgress,
      phase,
    }
  })
}

function resolvePhaseStateLabel(phase: ReturnType<typeof resolvePhaseProgress>[number]) {
  if (phase.isComplete) {
    return 'Complete'
  }

  if (phase.isInProgress) {
    return 'In progress'
  }

  return 'Pending'
}

type SoftphoneCallErrorAction = 'refresh-session' | 'retry-call'

function resolveSoftphoneCallError(errorMessage: string, errorDetails: string) {
  const normalizedMessage = errorMessage.trim().toLowerCase()
  const details = errorDetails.trim() || errorMessage.trim()

  if (
    normalizedMessage.includes('session expired')
    || normalizedMessage.includes('session not initialized')
    || normalizedMessage.includes('not authorized')
    || normalizedMessage.includes('status 401')
  ) {
    return {
      actions: ['refresh-session'] as SoftphoneCallErrorAction[],
      details,
      description: 'Your browser softphone session is no longer active. Refresh the session, then try the call again.',
      message: errorMessage,
      title: 'Session expired',
    }
  }

  if (normalizedMessage.includes('microphone permission')) {
    return {
      actions: ['retry-call'] as SoftphoneCallErrorAction[],
      details,
      description: 'Allow microphone access in the browser, then try starting the call again.',
      message: errorMessage,
      title: 'Microphone access is required',
    }
  }

  if (normalizedMessage.includes('e.164 format')) {
    return {
      actions: [] as SoftphoneCallErrorAction[],
      details,
      description: 'The selected profile has an invalid phone number configuration. Update the profile or choose a different one.',
      message: errorMessage,
      title: 'Profile configuration issue',
    }
  }

  return {
    actions: ['retry-call', 'refresh-session'] as SoftphoneCallErrorAction[],
    details,
    description: 'The browser softphone call ended unexpectedly. Use the diagnostic details below to identify the ACS response code.',
    message: errorMessage,
    title: normalizedMessage.includes('acs disconnected') ? 'ACS disconnected the call' : 'Call could not start',
  }
}

function CopyCallDiagnosticsButton(props: { value: string }) {
  const [copyState, setCopyState] = useState<'copied' | 'error' | 'idle'>('idle')
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.value)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }

    if (resetTimeoutRef.current != null) {
      window.clearTimeout(resetTimeoutRef.current)
    }

    resetTimeoutRef.current = window.setTimeout(() => {
      setCopyState('idle')
      resetTimeoutRef.current = null
    }, 2_000)
  }

  return (
    <Button
      aria-label="Copy ACS diagnostic details"
      className="shrink-0 border-destructive/30 bg-card text-destructive hover:bg-destructive/10"
      onClick={() => void handleCopy()}
      size="sm"
      type="button"
      variant="outline"
    >
      {copyState === 'copied' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy details'}
    </Button>
  )
}

function SoftphonePhaseStep(props: {
  isFirst: boolean
  isLast: boolean
  phase: ReturnType<typeof resolvePhaseProgress>[number]
  relatedFields: Array<{ id: string, label: string }>
}) {
  const metadataEntries = resolveMetadataEntries(props.phase.event?.metadata)
  const statusLabel = resolvePhaseStateLabel(props.phase)
  const stateClasses = props.phase.isComplete
    ? {
        badge: 'border-primary/30 bg-primary/10 text-primary',
        dot: 'bg-primary',
      }
    : props.phase.isInProgress
      ? {
          badge: 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          dot: 'bg-amber-500',
        }
      : {
          badge: 'border-border bg-muted/40 text-muted-foreground',
          dot: 'bg-muted-foreground/30',
        }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'group relative flex w-full min-w-0 items-center justify-center border border-r-0 bg-card px-2.5 py-2 text-center transition-colors hover:bg-muted/40',
            props.isFirst && 'rounded-l-md',
            props.isLast && 'rounded-r-md border-r',
            props.phase.isComplete && 'bg-primary/5 hover:bg-primary/10',
            props.phase.isInProgress && 'bg-amber-500/5 hover:bg-amber-500/10',
          )}
          type="button"
        >
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', stateClasses.dot)} />
            <p className="truncate text-sm font-medium text-foreground">{props.phase.phase.label}</p>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-foreground">{props.phase.phase.label}</p>
            <Badge variant="outline" className={cn(stateClasses.badge)}>
              {statusLabel}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{props.phase.phase.id}</p>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Event time</span>
            <span className="text-right text-foreground">
              {props.phase.event == null ? '-' : formatPhaseTimestamp(props.phase.event.timestamp)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Elapsed</span>
            <span className="text-right text-foreground">{props.phase.elapsed ?? '-'}</span>
          </div>
          <div className="grid gap-2">
            <span className="text-muted-foreground">Fields in this phase</span>
            {props.relatedFields.length === 0 ? (
              <span className="text-foreground">No fields mapped</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {props.relatedFields.map((field) => (
                  <Badge key={field.id} variant="outline" className="bg-card text-xs">
                    {field.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {metadataEntries.length > 0 ? (
            <div className="grid gap-2">
              <span className="text-muted-foreground">Metadata</span>
              <div className="flex flex-wrap gap-2">
                {metadataEntries.map(([key, value]) => (
                  <Badge key={key} variant="outline" className="bg-card text-xs">
                    {formatMetadataKey(key)}: {formatMetadataValue(value)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FieldMetadataIndicator(props: {
  generatedValue: SoftphoneScenarioValue
  metadata?: SoftphoneMetadataValues
  recognizedValue: SoftphoneScenarioValue
}) {
  const metadataEntries = resolveMetadataEntries(props.metadata)
  const isMatch = resolveMetadataMatch(props.metadata)
  const isExactValueMatch = areScenarioValuesEqual(props.generatedValue, props.recognizedValue)

  if (metadataEntries.length === 0 && !isExactValueMatch) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full border',
            metadataEntries.length > 0
              ? resolveMetadataIndicatorClasses(props.metadata)
              : 'border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
          )}
        >
          {isMatch === false ? <X className="size-3" /> : <Check className="size-3" />}
        </span>
      </TooltipTrigger>
      <TooltipContent
        align="end"
        className="max-w-sm border-border bg-popover px-3 py-2 text-popover-foreground shadow-md"
        side="top"
        sideOffset={8}
      >
        <div className="grid gap-1.5">
          {metadataEntries.length > 0 ? (
            metadataEntries.map(([key, value]) => (
              <div className="flex items-center justify-between gap-4 text-xs" key={key}>
                <span className="text-muted-foreground">{formatMetadataKey(key)}</span>
                <span className="font-medium text-foreground">{formatMetadataValue(value)}</span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium text-foreground">Matches generated value</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function SoftphonePage(props: {
  initialScenarioPreview?: SoftphoneScenarioAccessPreview | null
  scenarioId: string
}) {
  const [accessKey, setAccessKey] = useState('')
  const [bootstrapError, setBootstrapError] = useState('')
  const [caseState, setCaseState] = useState<SoftphoneCaseState | null>(null)
  const [correlationCode, setCorrelationCode] = useState('')
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [scenario, setScenario] = useState<SoftphoneScenarioSnapshot | null>(null)
  const [scenarioPreview, setScenarioPreview] = useState<SoftphoneScenarioAccessPreview | null>(props.initialScenarioPreview ?? null)
  const [isLoadingScenarioPreview, setIsLoadingScenarioPreview] = useState(props.initialScenarioPreview == null)
  const [externalEndpointBundle, setExternalEndpointBundle] = useState<SoftphoneExternalEndpointBundle | null>(null)
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false)
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false)
  const [isCallResultDialogOpen, setIsCallResultDialogOpen] = useState(false)
  const [isSwitchSessionDialogOpen, setIsSwitchSessionDialogOpen] = useState(false)
  const [isSwitchingSession, setIsSwitchingSession] = useState(false)
  const [isFontPopoverOpen, setIsFontPopoverOpen] = useState(false)
  const [dataFontSize, setDataFontSize] = useState<DataFontSize>('m')
  const [showMetadataDetails, setShowMetadataDetails] = useState(false)
  const [themeMode, setThemeMode] = useState<SoftphoneThemeMode>('light')
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [softphoneProfiles, setSoftphoneProfiles] = useState<SoftphoneProfile[]>([])
  const [feedbackMode, setFeedbackMode] = useState<'negative' | 'sentiment'>('sentiment')
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackPhaseId, setFeedbackPhaseId] = useState<string | null>(null)
  const [feedbackSeverityRating, setFeedbackSeverityRating] = useState<SoftphoneCallFeedback['severityRating']>(null)
  const storedScenarioAccess = useSoftphoneScenarioAccessStore((state) => state.entriesByScenarioId[props.scenarioId])
  const isScenarioAccessStoreHydrated = useSoftphoneScenarioAccessStore((state) => state.hydrated)
  const clearStoredScenarioAccess = useSoftphoneScenarioAccessStore((state) => state.clearScenarioAccess)
  const setStoredScenarioAccess = useSoftphoneScenarioAccessStore((state) => state.setScenarioAccess)
  const audioContextRef = useRef<AudioContext | null>(null)
  const autoUnlockAttemptRef = useRef<string | null>(null)
  const previousScenarioIdRef = useRef<string | null>(null)
  const viewerAccessQuery = useQuery({
    queryFn: () => getViewerRouteAccess(),
    queryKey: ['viewer-route-access'],
  })

  const activeProfile = useMemo(
    () => softphoneProfiles.find((profile) => profile.id === selectedProfileId) ?? softphoneProfiles[0] ?? null,
    [selectedProfileId, softphoneProfiles],
  )
  const scenarioBrandColor = scenario?.config.brandColor
    ?? scenarioPreview?.brandColor
    ?? storedScenarioAccess?.brandColor
    ?? DEFAULT_SOFTPHONE_BRAND_COLOR
  const scenarioBrandVariables = useMemo(() => buildSoftphoneBrandVariables(scenarioBrandColor), [scenarioBrandColor])
  const phaseProgress = useMemo(() => resolvePhaseProgress(scenario, caseState), [scenario, caseState])
  const intentBadges = useMemo(() => resolveIntentBadges(caseState?.intents ?? []), [caseState?.intents])
  const hasRecognizedFieldMetadata = useMemo(
    () =>
      Object.values(caseState?.recognizedData?.metadata ?? {}).some(
        (metadata) => resolveMetadataEntries(metadata).length > 0,
      ),
    [caseState?.recognizedData?.metadata],
  )
  const session = useSoftphoneSession(activeProfile, sessionId)
  const callError = useMemo(
    () => (session.errorMessage ? resolveSoftphoneCallError(session.errorMessage, session.errorDetails) : null),
    [session.errorDetails, session.errorMessage],
  )
  const {
    dismissPendingFeedback,
    pendingFeedbackEntry,
    submitFeedback,
  } = useSoftphoneCallHistory({
    activeCallState: session.activeCallState,
    callIdentifier: session.callIdentifier,
    caseState,
    correlationCode,
    hasActiveCall: session.hasActiveCall,
    profile: activeProfile,
    scenario,
    sessionId,
  })

  useEffect(() => {
    setFeedbackMode('sentiment')
    setFeedbackNote('')
    setFeedbackPhaseId(null)
    setFeedbackSeverityRating(null)
  }, [pendingFeedbackEntry?.id])

  function resetUnlockedState(message: string) {
    setBootstrapError(message)
    setCaseState(null)
    setCorrelationCode('')
    setExternalEndpointBundle(null)
    setIsUnlocked(false)
    setScenario(null)
    setSelectedProfileId('')
    setSessionId('')
    setSoftphoneProfiles([])
    setSyncMessage('')
    setSyncState('idle')
  }

  async function handleUnlock(nextAccessKey: string) {
    setIsLoadingBootstrap(true)
    setBootstrapError('')

    try {
      const payload = await unlockSoftphone(nextAccessKey, props.scenarioId)

      setCaseState(payload.caseState)
      setCorrelationCode(payload.correlationCode)
      setIsUnlocked(true)
      setScenario(payload.scenario)
      setScenarioPreview({
        brandColor: payload.scenario.config.brandColor,
        id: payload.scenario.id,
        name: payload.scenario.name,
      })
      setSelectedProfileId(payload.profiles[0]?.id || '')
      setSessionId(payload.sessionId)
      setSoftphoneProfiles(payload.profiles)
      setStoredScenarioAccess(props.scenarioId, {
        accessKey: nextAccessKey,
        brandColor: payload.scenario.config.brandColor,
        scenarioName: payload.scenario.name,
      })
      setSyncMessage('')
      setSyncState('syncing')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to unlock softphone access.'

      setBootstrapError(message)
      setIsUnlocked(false)
      setScenario(null)
      setSessionId('')

      if (message === 'Invalid access key.' || message === 'Unknown softphone scenario.') {
        clearStoredScenarioAccess(props.scenarioId)
      }
    } finally {
      setIsLoadingBootstrap(false)
    }
  }
  const triggerStoredUnlock = useEffectEvent((nextAccessKey: string) => {
    void handleUnlock(nextAccessKey)
  })

  useEffect(() => {
    if (previousScenarioIdRef.current === props.scenarioId) {
      return
    }

    previousScenarioIdRef.current = props.scenarioId
    autoUnlockAttemptRef.current = null
    resetUnlockedState('')
    setScenarioPreview(props.initialScenarioPreview ?? null)
    setIsLoadingScenarioPreview(props.initialScenarioPreview == null)
    setAccessKey(isScenarioAccessStoreHydrated ? (storedScenarioAccess?.accessKey ?? '') : '')
  }, [isScenarioAccessStoreHydrated, props.initialScenarioPreview, props.scenarioId, storedScenarioAccess?.accessKey])

  useEffect(() => {
    let cancelled = false

    if (props.initialScenarioPreview == null) {
      setIsLoadingScenarioPreview(true)
    }

    void fetchSoftphoneScenarioPreview(props.scenarioId)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setScenarioPreview(payload)
        setBootstrapError((currentValue) => (
          currentValue === 'Unknown softphone scenario.' ? '' : currentValue
        ))
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setScenarioPreview(null)
        setBootstrapError(error instanceof Error ? error.message : 'Unable to load softphone scenario.')
      })
      .finally(() => {
        if (cancelled) {
          return
        }

        setIsLoadingScenarioPreview(false)
      })

    return () => {
      cancelled = true
    }
  }, [props.initialScenarioPreview, props.scenarioId])

  useEffect(() => {
    if (!isUnlocked || !sessionId) {
      setExternalEndpointBundle(null)
      return
    }

    let cancelled = false

    void fetchSoftphoneExternalEndpoints(sessionId)
      .then((payload) => {
        if (!cancelled) {
          setExternalEndpointBundle(payload)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExternalEndpointBundle(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isUnlocked, sessionId])

  useEffect(() => {
    return () => {
      const activeAudioContext = audioContextRef.current
      audioContextRef.current = null
      void activeAudioContext?.close().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!isUnlocked || !sessionId) {
      return
    }

    let cancelled = false
    let isRecovering = false
    const eventSource = createSoftphoneCaseEventSource()

    const recoverCaseState = async () => {
      if (isRecovering) {
        return
      }

      isRecovering = true

      try {
        const nextCaseState = await fetchSoftphoneCaseState(sessionId)

        if (cancelled) {
          return
        }

        setCaseState(nextCaseState)
        setSyncState('synced')
        setSyncMessage('')
      } catch (error) {
        if (cancelled) {
          return
        }

        const message = error instanceof Error ? error.message : 'Unable to reconnect to IVR updates.'

        if (message === 'Softphone session not initialized.') {
          resetUnlockedState('Session expired. Enter the access key again.')
          return
        }

        setSyncState('error')
        setSyncMessage(message)
      } finally {
        isRecovering = false
      }
    }

    const handleCaseStateEvent = (event: Event) => {
      if (cancelled) {
        return
      }

      try {
        const nextCaseState = JSON.parse((event as MessageEvent<string>).data) as SoftphoneCaseState
        setCaseState(nextCaseState)
        setSyncState('synced')
        setSyncMessage('')
      } catch {
        setSyncState('error')
        setSyncMessage('Received an invalid IVR update from the server.')
      }
    }

    eventSource.addEventListener('case-state', handleCaseStateEvent)
    eventSource.onopen = () => {
      if (cancelled) {
        return
      }

      setSyncState('synced')
      setSyncMessage('')
    }
    eventSource.onerror = () => {
      if (cancelled) {
        return
      }

      setSyncState('syncing')
      setSyncMessage('Reconnecting to IVR updates...')
      void recoverCaseState()
    }

    return () => {
      cancelled = true
      eventSource.removeEventListener('case-state', handleCaseStateEvent)
      eventSource.close()
    }
  }, [isUnlocked, sessionId])

  useEffect(() => {
    const storedAccessKey = storedScenarioAccess?.accessKey ?? ''

    if (
      !isScenarioAccessStoreHydrated ||
      isUnlocked ||
      isLoadingBootstrap ||
      isLoadingScenarioPreview ||
      scenarioPreview == null ||
      !/^\d{5}$/.test(storedAccessKey) ||
      autoUnlockAttemptRef.current === storedAccessKey
    ) {
      return
    }

    autoUnlockAttemptRef.current = storedAccessKey
    setAccessKey(storedAccessKey)
    triggerStoredUnlock(storedAccessKey)
  }, [
    isLoadingBootstrap,
    isLoadingScenarioPreview,
    isScenarioAccessStoreHydrated,
    isUnlocked,
    scenarioPreview,
    storedScenarioAccess?.accessKey,
  ])

  async function handleStartOrEndCall() {
    if (session.hasActiveCall) {
      await session.endCall()
      return
    }

    if (scenario == null) {
      setSyncState('error')
      setSyncMessage('Scenario configuration is not loaded.')
      return
    }

    const generatedCaseData = generateSoftphoneCaseDataPayload(scenario.config)

    setCaseState((currentValue) => ({
      caseData: generatedCaseData,
      debugInformation: null,
      intents: [],
      ivrRawText: null,
      phaseEvents: [],
      recognizedData: null,
      updatedAt: currentValue?.updatedAt ?? null,
    }))
    setSyncState('syncing')
    setSyncMessage('')

    try {
      const nextCaseState = await setSoftphoneCaseData(generatedCaseData, sessionId)
      setCaseState(nextCaseState)
      setSyncState('synced')
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : 'Unable to sync generated case data.')
    }

    await session.startCall()
  }

  async function handleRefreshSession() {
    const nextAccessKey = accessKey.trim() || storedScenarioAccess?.accessKey?.trim() || ''

    if (!/^\d{5}$/.test(nextAccessKey)) {
      resetUnlockedState('Enter the 5-digit access key again to refresh the session.')
      return
    }

    setAccessKey(nextAccessKey)
    await handleUnlock(nextAccessKey)
  }

  async function handleSwitchSession() {
    setIsSwitchingSession(true)

    try {
      if (session.hasActiveCall) {
        await session.endCall()
      }
    } catch {
      // Ignore call teardown issues while clearing the local session state.
    } finally {
      clearStoredScenarioAccess(props.scenarioId)
      autoUnlockAttemptRef.current = null
      setAccessKey('')
      resetUnlockedState('')
      setIsSwitchSessionDialogOpen(false)
      setIsSwitchingSession(false)
    }
  }

  async function handleToggleMute() {
    await session.toggleMute()
  }

  async function handleSendDtmfTone(tone: SoftphoneDtmfTone) {
    try {
      const AudioContextClass = resolveAudioContextClass()
      if (AudioContextClass != null) {
        const audioContext =
          audioContextRef.current ?? new AudioContextClass()
        audioContextRef.current = audioContext

        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }

        const [lowFrequency, highFrequency] = DTMF_FREQUENCIES_BY_TONE[tone]
        const gainNode = audioContext.createGain()
        const stopAt =
          audioContext.currentTime + DTMF_KEYPAD_TONE_DURATION_MS / 1000

        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.01)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt)
        gainNode.connect(audioContext.destination)

        for (const frequency of [lowFrequency, highFrequency]) {
          const oscillatorNode = audioContext.createOscillator()
          oscillatorNode.type = 'sine'
          oscillatorNode.frequency.setValueAtTime(frequency, audioContext.currentTime)
          oscillatorNode.connect(gainNode)
          oscillatorNode.start()
          oscillatorNode.stop(stopAt)
          oscillatorNode.onended = () => {
            oscillatorNode.disconnect()
          }
        }
      }
    } catch {
      // Ignore local audio feedback failures and still send the DTMF tone.
    }

    await session.sendDtmfTone(tone)
  }

  function handleSubmitPositiveFeedback() {
    if (pendingFeedbackEntry == null) {
      return
    }

    submitFeedback(pendingFeedbackEntry.id, {
      note: null,
      phaseGroup: null,
      sentiment: 'up',
      severityRating: null,
      submittedAt: new Date().toISOString(),
    })
  }

  function handleSubmitNegativeFeedback() {
    if (pendingFeedbackEntry == null || feedbackPhaseId == null) {
      return
    }

    submitFeedback(pendingFeedbackEntry.id, {
      note: feedbackNote.trim() || null,
      phaseGroup: feedbackPhaseId,
      sentiment: 'down',
      severityRating: feedbackSeverityRating,
      submittedAt: new Date().toISOString(),
    })
  }

  const isFeedbackDialogOpen = pendingFeedbackEntry != null
  const areHotkeysEnabled = isUnlocked && activeProfile != null && !isLoadingBootstrap
  const arePhoneControlHotkeysEnabled = areHotkeysEnabled && !isFeedbackDialogOpen
  const isDtmfHotkeyEnabled = arePhoneControlHotkeysEnabled && session.isCallConnectedState && !session.isBusy
  const callButtonClassName = session.hasActiveCall
    ? 'border-destructive bg-destructive text-white hover:border-destructive hover:bg-destructive/90'
    : 'border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary/90'

  useSoftphoneRouteHotkey('Enter', () => {
    if (session.isBusy) {
      return
    }

    void handleStartOrEndCall()
  }, {
    enabled: arePhoneControlHotkeysEnabled,
    shouldHandle: shouldHandleSoftphoneActionHotkey,
  })

  useSoftphoneRouteHotkey('Space', () => {
    if (!session.hasActiveCall || session.isBusy) {
      return
    }

    void handleToggleMute()
  }, {
    enabled: arePhoneControlHotkeysEnabled && session.hasActiveCall,
    shouldHandle: shouldHandleSoftphoneActionHotkey,
  })

  useSoftphoneDtmfHotkeys(isDtmfHotkeyEnabled, (tone) => {
    void handleSendDtmfTone(tone)
  })

  useEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const hadDarkClass = rootElement.classList.contains('dark')
    const previousColorScheme = rootElement.style.colorScheme

    rootElement.classList.toggle('dark', themeMode === 'dark')
    rootElement.style.colorScheme = themeMode
    bodyElement.style.colorScheme = themeMode

    return () => {
      rootElement.classList.toggle('dark', hadDarkClass)
      rootElement.style.colorScheme = previousColorScheme
      bodyElement.style.colorScheme = previousColorScheme
    }
  }, [themeMode])

  useEffect(() => {
    const rootElement = document.documentElement
    const previousValues = new Map<string, string>()

    for (const [key, value] of Object.entries(scenarioBrandVariables)) {
      if (!key.startsWith('--')) {
        continue
      }

      previousValues.set(key, rootElement.style.getPropertyValue(key))
      rootElement.style.setProperty(key, String(value))
    }

    return () => {
      for (const [key, value] of previousValues) {
        if (value) {
          rootElement.style.setProperty(key, value)
        } else {
          rootElement.style.removeProperty(key)
        }
      }
    }
  }, [scenarioBrandVariables])

  const featureFlags = scenario?.config.features ?? {
    debugInformation: true,
    intents: true,
    phases: true,
    rawText: true,
    recognizedData: true,
  }
  const informationContext = {
    accessKey: accessKey.trim() || storedScenarioAccess?.accessKey || null,
    activeProfile,
    correlationCode: correlationCode || null,
    externalEndpointBundle,
    features: featureFlags,
    scenarioId: scenario?.id ?? scenarioPreview?.id ?? props.scenarioId,
    scenarioName: scenario?.name ?? scenarioPreview?.name ?? storedScenarioAccess?.scenarioName ?? 'Softphone scenario',
    softphoneUrl: typeof window !== 'undefined' ? window.location.href : null,
  }
  const dataFontScale = resolveDataFontScale(dataFontSize)
  const intentBadgeScale = resolveIntentBadgeScale(dataFontSize)
  const softphoneThemeClassName = themeMode === 'dark' ? 'dark' : undefined

  if (!isUnlocked) {
    return (
      <div
        className={cn('grid min-h-svh place-items-center px-6 py-10', softphoneThemeClassName)}
        style={{
          ...scenarioBrandVariables,
          backgroundColor: scenarioBrandColor,
          backgroundImage: `linear-gradient(160deg, ${withAlpha(scenarioBrandColor, 0.04)} 0%, ${withAlpha('#000000', 0.2)} 100%)`,
        }}
      >
        <div className="grid w-full max-w-sm gap-5 rounded-lg bg-white p-8 shadow-lg">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Scenario softphone</p>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
              {scenarioPreview?.name ?? storedScenarioAccess?.scenarioName ?? 'Access key required'}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {isLoadingScenarioPreview
                ? 'Loading scenario...'
                : <>Unlock scenario <span className="font-mono text-xs">{scenarioPreview?.id ?? props.scenarioId}</span> with your access key.</>}
            </p>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (isLoadingBootstrap || isLoadingScenarioPreview || scenarioPreview == null || !/^\d{5}$/.test(accessKey)) {
                return
              }

              void handleUnlock(accessKey)
            }}
          >
            <div className="grid gap-2">
              <Label className="text-neutral-900" htmlFor="softphone-access-key">Access key</Label>
              <Input
                className="bg-white font-mono text-lg tracking-[0.2em] text-neutral-900 placeholder:tracking-[0.2em]"
                id="softphone-access-key"
                inputMode="numeric"
                maxLength={5}
                pattern="[0-9]{5}"
                placeholder="12345"
                value={accessKey}
                onChange={(event) => {
                  setAccessKey(event.target.value.replace(/\D/g, '').slice(0, 5))
                }}
              />
            </div>

            {bootstrapError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {bootstrapError}
              </div>
            ) : null}

            <Button
              type="submit"
              className="bg-[var(--softphone-brand)] text-white hover:bg-[var(--softphone-brand)] hover:opacity-90"
              disabled={isLoadingBootstrap || isLoadingScenarioPreview || scenarioPreview == null || !/^\d{5}$/.test(accessKey)}
            >
              {isLoadingBootstrap ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Unlock scenario
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('min-h-svh bg-background', softphoneThemeClassName)} style={scenarioBrandVariables}>
      <div className="mx-auto grid max-w-[100rem] items-start gap-4 px-4 py-4 md:px-6 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(34rem,1.35fr)]">
        <div className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-md bg-[var(--softphone-brand)] text-white">
              <FlaskConical className="size-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-foreground">IVR Test Lab</p>
              <p className="text-xs text-muted-foreground">Softphone workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2" data-softphone-hotkey-exclude="true">
            <Button size="sm" type="button" variant="outline" onClick={() => setIsAboutDialogOpen(true)}>
              <Info className="size-3.5" />
              About
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => setIsSwitchSessionDialogOpen(true)}>
              Switch session
            </Button>
            {viewerAccessQuery.data?.isAuthenticated ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/admins/developer-information">
                  <LayoutDashboard className="size-3.5" />
                  Admin
                </Link>
              </Button>
            ) : null}
            <Button
              aria-label="Help"
              size="icon-sm"
              type="button"
              variant="outline"
              onClick={() => setIsHelpDialogOpen(true)}
            >
              <CircleHelp className="size-4" />
            </Button>
            <Button
              aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              size="icon-sm"
              type="button"
              variant="outline"
              onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
            >
              {themeMode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Popover open={isFontPopoverOpen} onOpenChange={setIsFontPopoverOpen}>
              <PopoverTrigger asChild>
                <Button aria-label="Data font size" size="icon-sm" type="button" variant="outline">
                  <Type className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-3" data-softphone-hotkey-exclude="true">
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-foreground">Data font size</p>
                  <div className="grid grid-cols-5 gap-1">
                    {DATA_FONT_SIZE_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        title={option.description}
                        type="button"
                        variant={dataFontSize === option.value ? 'default' : 'outline'}
                        onClick={() => {
                          setDataFontSize(option.value)
                          setIsFontPopoverOpen(false)
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="grid gap-4">
          <Card data-softphone-hotkey-scope="call-ui">
            <CardHeader>
              <CardTitle>{scenario?.name ?? 'Softphone scenario'}</CardTitle>
              <CardDescription>
                Scenario <span className="font-mono text-xs">{scenario?.id ?? props.scenarioId}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {bootstrapError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {bootstrapError}
                </div>
              ) : null}

              <div className="grid gap-2" data-softphone-hotkey-exclude="true">
                <Label htmlFor="softphone-profile">Server profile</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId} disabled={isLoadingBootstrap || softphoneProfiles.length === 0}>
                  <SelectTrigger id="softphone-profile" className="w-full">
                    <SelectValue placeholder={isLoadingBootstrap ? 'Loading profiles...' : 'Select profile'} />
                  </SelectTrigger>
                  <SelectContent data-softphone-hotkey-exclude="true">
                    {softphoneProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">IVR code</p>
                    <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-[0.3em] text-foreground">{correlationCode || '----'}</p>
                  </div>
                  <p className="max-w-[14rem] text-xs leading-5 text-muted-foreground">
                    Enter these 4 digits in the Copilot Studio start dialog.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Primary</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{maskPhoneNumber(activeProfile?.primaryPhoneNumber)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Caller ID</p>
                  <p className="mt-1 font-mono text-sm text-foreground">{maskPhoneNumber(activeProfile?.alternateCallerId)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Profile title</p>
                  <p className="mt-1 text-sm text-foreground">{activeProfile?.titleText || 'None'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button className={callButtonClassName} onClick={() => void handleStartOrEndCall()} disabled={activeProfile == null || session.isBusy}>
                  {session.isBusy ? <LoaderCircle className="size-4 animate-spin" /> : session.hasActiveCall ? <PhoneOff className="size-4" /> : <PhoneCall className="size-4" />}
                  {session.hasActiveCall ? 'End call' : 'Start call'}
                </Button>
                <Button variant="outline" onClick={() => void handleToggleMute()} disabled={!session.hasActiveCall || session.isBusy}>
                  {session.isMicMuted ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  {session.isMicMuted ? 'Unmute' : 'Mute'}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" disabled={!session.isCallConnectedState || session.isBusy} data-softphone-hotkey-exclude="true">
                      <Grip className="size-4" />
                      Keypad
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[18rem] p-4" data-softphone-action-hotkey-exclude="true">
                    <div className="grid gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">DTMF keypad</p>
                        <p className="text-xs text-muted-foreground">Send live keypad input once the ACS call is connected.</p>
                      </div>
                      {DTMF_ROWS.map((row) => (
                        <div className="grid grid-cols-3 gap-3" key={row.join('')}>
                          {row.map((tone) => (
                            <Button
                              key={tone}
                              variant="outline"
                              className="h-12 text-lg"
                              disabled={!session.isCallConnectedState || session.isBusy}
                              onClick={() => void handleSendDtmfTone(tone)}
                            >
                              {tone}
                            </Button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {callError ? (
                  <Button
                    aria-expanded={isCallResultDialogOpen}
                    aria-haspopup="dialog"
                    className="active:-translate-y-px"
                    data-softphone-action-hotkey-exclude="true"
                    onClick={() => setIsCallResultDialogOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Info className="size-3.5" />
                    Last call result
                  </Button>
                ) : null}
              </div>

              {syncMessage || syncState !== 'idle' ? (
                <p className={`text-xs ${syncState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {syncMessage || (syncState === 'synced' ? 'Live IVR updates connected.' : 'Connecting IVR updates...')}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {featureFlags.rawText || featureFlags.debugInformation ? (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Live IVR text</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {featureFlags.rawText ? (
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Raw text</p>
                    <p className={cn('mt-2 whitespace-pre-wrap font-mono text-foreground', dataFontScale.code)}>
                      {caseState?.ivrRawText?.text || '-'}
                    </p>
                  </div>
                ) : null}

                {featureFlags.debugInformation ? (
                  <div className={cn('min-w-0', featureFlags.rawText ? 'border-t pt-4' : null)}>
                    <p className="text-xs font-medium text-muted-foreground">Debug information</p>
                    <div className="mt-2 max-w-full overflow-hidden">
                      <pre className={cn('max-w-full whitespace-pre-wrap break-words font-mono text-foreground', dataFontScale.code)}>
                        {caseState?.debugInformation?.text || '-'}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Live scenario data</CardTitle>
            </CardHeader>
            <CardContent className={cn('grid min-w-0 gap-4', dataFontScale.body)}>
              {featureFlags.phases ? (
                <div className="overflow-x-auto pb-1">
                  <div className="flex w-full min-w-[42rem] items-stretch">
                    {phaseProgress.map((phase, index) => {
                      const relatedFields = (scenario?.config.recognizedFields ?? [])
                        .filter((field) => field.phaseId === phase.phase.id)
                        .map((field) => ({ id: field.id, label: field.label }))

                      return (
                        <div className="flex min-w-0 flex-1 items-stretch" key={phase.phase.id}>
                          <SoftphonePhaseStep
                            isFirst={index === 0}
                            isLast={index === phaseProgress.length - 1}
                            phase={phase}
                            relatedFields={relatedFields}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {featureFlags.intents ? (
                <div className="flex min-h-6 flex-wrap items-center gap-2">
                  {intentBadges.length > 0 ? (
                    intentBadges.map((intent) => (
                      <Badge
                        className={cn(
                          'border-primary/30 bg-primary/10 text-primary',
                          intentBadgeScale,
                        )}
                        key={intent}
                        variant="outline"
                      >
                        {intent}
                      </Badge>
                    ))
                  ) : (
                    <Badge
                      className={cn(
                        'border-border bg-muted/40 text-muted-foreground',
                        intentBadgeScale,
                      )}
                      variant="outline"
                    >
                      No intent yet
                    </Badge>
                  )}
                </div>
              ) : null}

              {featureFlags.recognizedData ? (
                <div className="min-w-0">
                  <TooltipProvider delayDuration={120}>
                    <div className="max-w-full overflow-x-auto rounded-lg border">
                      <table className={cn('min-w-full text-left', dataFontScale.table)}>
                        <thead className="border-b bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className={cn('px-3 py-2.5 text-xs font-medium')}>Field</th>
                            <th className={cn('px-3 py-2.5 text-xs font-medium')}>Generated</th>
                            <th className={cn('px-3 py-2.5 text-xs font-medium')}>Recognized</th>
                            {hasRecognizedFieldMetadata ? (
                              <th
                                className={cn(
                                  'px-2 py-2 text-left text-xs font-medium',
                                  showMetadataDetails ? 'min-w-56' : 'w-12 min-w-12',
                                )}
                              >
                                <button
                                  aria-label={showMetadataDetails ? 'Hide metadata details' : 'Show metadata details'}
                                  className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
                                  onClick={() => setShowMetadataDetails((currentValue) => !currentValue)}
                                  type="button"
                                >
                                  <ChevronRight className={cn('size-4 transition-transform', showMetadataDetails && 'rotate-90')} />
                                </button>
                              </th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(scenario?.config.recognizedFields ?? []).map((field) => {
                            const fieldMetadata = caseState?.recognizedData?.metadata?.[field.id]
                            const metadataEntries = resolveMetadataEntries(fieldMetadata)

                            return (
                              <tr key={field.id}>
                                <td className={cn('px-3 py-2.5 font-medium text-foreground', dataFontScale.table)}>{field.label}</td>
                                <td
                                  className={cn(
                                    'px-3 py-2.5 font-mono text-foreground',
                                    dataFontScale.table,
                                    field.id === 'aktenzeichen' ? `${dataFontScale.emphasis} font-semibold tracking-[0.08em]` : null,
                                  )}
                                >
                                  {formatRecognizedComparisonValue(field.id, caseState?.caseData?.values[field.id] ?? null)}
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-2.5 font-mono text-foreground',
                                    dataFontScale.table,
                                    field.id === 'aktenzeichen' ? `${dataFontScale.emphasis} font-semibold tracking-[0.08em]` : null,
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="min-w-0 truncate">
                                      {formatRecognizedComparisonValue(field.id, caseState?.recognizedData?.values[field.id] ?? null)}
                                    </span>
                                    <FieldMetadataIndicator
                                      generatedValue={caseState?.caseData?.values[field.id] ?? null}
                                      metadata={fieldMetadata}
                                      recognizedValue={caseState?.recognizedData?.values[field.id] ?? null}
                                    />
                                  </div>
                                </td>
                                {hasRecognizedFieldMetadata ? (
                                  <td
                                    className={cn(
                                      'px-3 py-2.5 text-foreground',
                                      dataFontScale.table,
                                      !showMetadataDetails && 'w-12 min-w-12 px-2',
                                    )}
                                  >
                                    {showMetadataDetails ? (
                                      metadataEntries.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {metadataEntries.map(([key, value]) => (
                                            <Badge key={key} variant="outline" className="text-xs">
                                              {formatMetadataKey(key)}: {formatMetadataValue(value)}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )
                                    ) : null}
                                  </td>
                                ) : null}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TooltipProvider>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl" data-softphone-hotkey-exclude="true">
          <DialogTitle className="sr-only">Softphone help</DialogTitle>
          <SoftphoneInformationSurface context={informationContext} showDeveloperTab={false} />
        </DialogContent>
      </Dialog>

      <Dialog open={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl" data-softphone-hotkey-exclude="true">
          <div className="border-b px-5 py-5 sm:px-6">
            <DialogHeader>
              <DialogTitle>About the softphone lab</DialogTitle>
              <DialogDescription>
                How this IVR test lab works together with Copilot Studio.
              </DialogDescription>
            </DialogHeader>
          </div>
          <ScrollArea className="h-[min(60vh,34rem)]">
            <div className="px-5 py-5 sm:px-6">
              <SoftphoneAboutContent />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isCallResultDialogOpen && callError != null} onOpenChange={setIsCallResultDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl" data-softphone-hotkey-exclude="true">
          {callError ? (
            <>
              <div className="border-b px-5 py-5 sm:px-6">
                <DialogHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                    <div className="min-w-0">
                      <DialogTitle>{callError.title}</DialogTitle>
                      <DialogDescription className="mt-2 break-words font-mono text-xs text-destructive">
                        {callError.message}
                      </DialogDescription>
                    </div>
                    <CopyCallDiagnosticsButton value={callError.details} />
                  </div>
                </DialogHeader>
              </div>

              <ScrollArea className="h-[min(58vh,30rem)]">
                <div className="grid gap-4 px-5 py-5 sm:px-6">
                  <p className="text-sm leading-6 text-muted-foreground">{callError.description}</p>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5 text-foreground">
                    {callError.details}
                  </pre>
                </div>
              </ScrollArea>

              {callError.actions.length > 0 ? (
                <DialogFooter>
                  {callError.actions.includes('retry-call') ? (
                    <Button
                      disabled={activeProfile == null || session.isBusy || isLoadingBootstrap}
                      onClick={() => {
                        setIsCallResultDialogOpen(false)
                        void handleStartOrEndCall()
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Try again
                    </Button>
                  ) : null}
                  {callError.actions.includes('refresh-session') ? (
                    <Button
                      disabled={isLoadingBootstrap}
                      onClick={() => {
                        setIsCallResultDialogOpen(false)
                        void handleRefreshSession()
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {isLoadingBootstrap ? <LoaderCircle className="size-4 animate-spin" /> : null}
                      Refresh session
                    </Button>
                  ) : null}
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isSwitchSessionDialogOpen} onOpenChange={setIsSwitchSessionDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-softphone-hotkey-exclude="true">
          <DialogHeader>
            <DialogTitle>Switch session</DialogTitle>
            <DialogDescription>
              Clear the current unlock and IVR session so you can enter a different access key for this scenario.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>
              The stored access key for <span className="font-mono">{props.scenarioId}</span> will be removed from this browser.
            </p>
            <p>
              If a call is still active, the softphone will end it first and then return you to the access key screen.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsSwitchSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isSwitchingSession} onClick={() => void handleSwitchSession()}>
              {isSwitchingSession ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingFeedbackEntry != null} onOpenChange={(open) => !open && dismissPendingFeedback()}>
        <DialogContent className="sm:max-w-lg" data-softphone-hotkey-exclude="true">
          <DialogHeader>
            <DialogTitle>How was this call?</DialogTitle>
            <DialogDescription>
              {feedbackMode === 'sentiment'
                ? 'Share quick feedback about the browser softphone call you just finished.'
                : 'Select the main phase that caused trouble. Ratings and notes are optional.'}
            </DialogDescription>
          </DialogHeader>

          {feedbackMode === 'sentiment' ? (
            <div className="grid gap-3">
              <Button className="h-14 justify-start gap-3 text-left" onClick={handleSubmitPositiveFeedback} variant="outline">
                <ThumbsUp className="size-5 text-primary" />
                <span className="font-medium">Thumbs up</span>
              </Button>
              <Button className="h-14 justify-start gap-3 text-left" onClick={() => setFeedbackMode('negative')} variant="outline">
                <ThumbsDown className="size-5 text-rose-600" />
                <span className="font-medium">Thumbs down</span>
              </Button>
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label>Main phase</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(scenario?.config.phases ?? []).map((phase) => {
                    const isSelected = feedbackPhaseId === phase.id

                    return (
                      <Button
                        className={isSelected ? 'border-rose-500 bg-rose-50 text-rose-900 hover:bg-rose-100' : ''}
                        key={phase.id}
                        onClick={() => setFeedbackPhaseId(phase.id)}
                        type="button"
                        variant="outline"
                      >
                        {phase.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Severity</Label>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_RATINGS.map((rating) => (
                    <Button
                      className={feedbackSeverityRating === rating ? 'border-rose-500 bg-rose-50 text-rose-900 hover:bg-rose-100' : ''}
                      key={rating}
                      onClick={() => setFeedbackSeverityRating(rating)}
                      type="button"
                      variant="outline"
                    >
                      {rating}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>1 = minor issue</span>
                  <span>5 = major blocker</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="softphone-feedback-note">Note</Label>
                <Textarea
                  id="softphone-feedback-note"
                  placeholder="What went wrong?"
                  value={feedbackNote}
                  onChange={(event) => setFeedbackNote(event.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {feedbackMode === 'negative' ? (
              <>
                <Button type="button" variant="outline" onClick={() => setFeedbackMode('sentiment')}>
                  Back
                </Button>
                <Button type="button" onClick={handleSubmitNegativeFeedback} disabled={feedbackPhaseId == null}>
                  Submit
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => dismissPendingFeedback()}>
                Skip
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
