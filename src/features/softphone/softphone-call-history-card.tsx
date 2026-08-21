import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChevronDown, Download, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  formatSoftphoneDuration,
  getSoftphoneAverageElapsedToStep,
  getSoftphoneCallDurationTrend,
  getSoftphoneFeedbackOverviewData,
  getSoftphoneCallHistorySummary,
  getSoftphoneNegativeFeedbackByPhaseData,
  getSoftphonePhaseReachData,
  resolveSoftphonePhaseGroupTitle,
  type SoftphoneCallHistoryEntry,
  type SoftphoneCallFeedback,
  type SoftphoneCallHistoryTextEvent,
} from '@/features/softphone/call-history'
import { formatScenarioValue } from '@/features/softphone/scenario'
import type { SoftphoneProfileSnapshot } from '@/features/softphone/types'

export interface SoftphoneCallHistoryDisplayEntry extends SoftphoneCallHistoryEntry {
  operator?: {
    email: string | null
    id: string | null
    image: string | null
    name: string | null
    role: string | null
  } | null
  profileSnapshot?: SoftphoneProfileSnapshot | null
}

const durationConfig = {
  journeyMinutes: {
    color: 'var(--chart-1)',
    label: 'Journey min.',
  },
  totalMinutes: {
    color: 'var(--chart-2)',
    label: 'Total min.',
  },
} satisfies ChartConfig

const stepReachConfig = {
  reached: {
    color: 'var(--chart-1)',
    label: 'Calls reached',
  },
} satisfies ChartConfig

const elapsedConfig = {
  seconds: {
    color: 'var(--chart-3)',
    label: 'Avg seconds',
  },
} satisfies ChartConfig

const feedbackOverviewConfig = {
  count: {
    color: 'var(--chart-1)',
    label: 'Calls',
  },
} satisfies ChartConfig

const negativePhaseConfig = {
  count: {
    color: 'var(--destructive)',
    label: 'Negative feedback',
  },
} satisfies ChartConfig

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function formatDateTimeWithSeconds(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    year: 'numeric',
  })
}

function renderJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function formatPercentage(value: number) {
  return `${value}%`
}

type SoftphoneHistoryFeedbackFilter = 'all' | 'down' | 'up'
type SoftphoneHistoryPhaseFilter = 'all' | string

function resolveLocalDateMidnightMs(value: string) {
  if (!value) {
    return null
  }

  const timestamp = new Date(`${value}T00:00:00`).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function resolveTodayDateInputMax() {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function downloadMarkdownFile(filename: string, content: string) {
  if (typeof window === 'undefined') {
    return
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

function buildCallHistoryMarkdownExport(options: {
  calls: SoftphoneCallHistoryDisplayEntry[]
  feedbackFilter: SoftphoneHistoryFeedbackFilter
  phaseFilter: string
  phaseFilterLabel: string
  fromDate: string
  generatedAt: Date
  mode: 'admin' | 'local'
  totalCalls: number
  visibleCalls: number
}) {
  const lines: string[] = []
  const fromDateLabel = options.fromDate ? options.fromDate : 'Any'
  const feedbackLabel = options.feedbackFilter === 'all'
    ? 'Any'
    : options.feedbackFilter === 'up'
      ? 'Thumbs up only'
      : 'Thumbs down only'
  const phaseLabel = options.phaseFilter === 'all'
    ? 'Any'
    : options.phaseFilterLabel

  function renderValue(value: unknown) {
    if (value == null) {
      return '-'
    }

    if (typeof value === 'string') {
      return value.length > 0 ? value : '-'
    }

    return String(value)
  }

  function renderCaseValues(payload: SoftphoneCallHistoryDisplayEntry['generatedCaseData']) {
    if (payload == null || Object.keys(payload.values ?? {}).length === 0) {
      return ['- _None_']
    }

    return Object.entries(payload.values).map(([key, value]) => `- \`${key}\`: ${formatScenarioValue(value)}`)
  }

  function renderTextEvents(events: SoftphoneCallHistoryTextEvent[] | undefined) {
    if ((events ?? []).length === 0) {
      return ['- _None_']
    }

    return (events ?? []).flatMap((event) => [
      `- ${event.timestamp}`,
      '',
      '```text',
      event.text,
      '```',
    ])
  }

  lines.push('# Softphone call analytics export')
  lines.push('')
  lines.push(`Generated: ${options.generatedAt.toISOString()}`)
  lines.push(`Visible calls: ${options.visibleCalls}`)
  lines.push('')
  lines.push('## Filters')
  lines.push('')
  lines.push(`- From date: ${fromDateLabel} (until today)`)
  lines.push(`- Feedback: ${feedbackLabel}`)
  lines.push(`- Phase: ${phaseLabel}`)
  lines.push('')

  if (options.calls.length === 0) {
    lines.push('_No calls matched the current filters._')
    lines.push('')
    return lines.join('\n')
  }

  options.calls.forEach((call, index) => {
    lines.push(`## Call ${index + 1}`)
    lines.push('')
    lines.push(`- Session: ${renderValue(call.sessionId)}`)
    lines.push(`- Correlation: ${renderValue(call.correlationCode)}`)
    lines.push(`- Scenario: ${call.scenarioName ?? '-'}${call.scenarioId ? ` (${call.scenarioId})` : ''}`)
    lines.push(`- Profile: ${renderValue(call.profileName)}`)
    lines.push(`- ACS call id: ${renderValue(call.callIdentifier)}`)
    lines.push(`- Started: ${renderValue(call.startedAt)}`)
    lines.push(`- Ended: ${renderValue(call.endedAt)}`)
    lines.push(`- Journey: ${formatSoftphoneDuration(call.totalDurationWithoutInitMs)}`)
    lines.push(`- Total: ${formatSoftphoneDuration(call.totalDurationMs)}`)
    lines.push(`- Final state: ${renderValue(call.finalCallState)}`)
    if (options.mode === 'admin') {
      lines.push(`- Operator: ${call.operator?.name ?? 'Anonymous'}`)
    }
    lines.push('')
    lines.push('### Feedback')
    lines.push('')
    if (call.feedback == null) {
      lines.push('- _None_')
    } else {
      lines.push(`- Sentiment: ${call.feedback.sentiment === 'up' ? 'Thumbs up' : 'Thumbs down'}`)
      lines.push(`- Submitted: ${call.feedback.submittedAt}`)
      lines.push(`- Phase: ${renderValue(call.feedback.phaseGroup)}`)
      lines.push(`- Severity: ${call.feedback.severityRating == null ? '-' : `${call.feedback.severityRating}/5`}`)
      if (call.feedback.note) {
        lines.push('')
        lines.push('```text')
        lines.push(call.feedback.note)
        lines.push('```')
      }
    }
    lines.push('')

    lines.push('### Phase timeline')
    lines.push('')
    if ((call.phases ?? []).length === 0) {
      lines.push('- _None_')
    } else {
      ;(call.phases ?? []).forEach((phase) => {
        lines.push(`- ${renderValue(phase.timestamp)}: ${resolveSoftphonePhaseGroupTitle(phase.phaseId, call.scenarioSnapshot) ?? phase.phaseId}`)
      })
    }
    lines.push('')

    lines.push('### Intents')
    lines.push('')
    if ((call.intents ?? []).length === 0) {
      lines.push('- _None_')
    } else {
      ;(call.intents ?? []).forEach((intent) => lines.push(`- ${intent}`))
    }
    lines.push('')

    lines.push('### Generated case data (values)')
    lines.push('')
    lines.push(...renderCaseValues(call.generatedCaseData))
    lines.push('')

    lines.push('### Recognized case data (values)')
    lines.push('')
    lines.push(...renderCaseValues(call.recognizedData))
    lines.push('')

    lines.push('### IVR raw text timeline')
    lines.push('')
    lines.push(...renderTextEvents(call.ivrRawTextEvents))
    lines.push('')

    lines.push('### Debug information timeline')
    lines.push('')
    lines.push(...renderTextEvents(call.debugInformationEvents))
    lines.push('')
  })

  return lines.join('\n')
}

function resolveSoftphoneHistoryPhaseOptions(history: SoftphoneCallHistoryDisplayEntry[]) {
  const phaseMap = new Map<string, string>()

  for (const entry of history) {
    const resolvePhaseLabel = (phaseId: string) => {
      const normalizedPhaseId = phaseId.trim()
      const resolvedLabel = resolveSoftphonePhaseGroupTitle(normalizedPhaseId, entry.scenarioSnapshot)
      return (resolvedLabel?.trim() ?? normalizedPhaseId).trim() || normalizedPhaseId
    }

    const feedbackPhase = entry.feedback?.phaseGroup?.trim()
    if (!feedbackPhase) {
      continue
    }

    phaseMap.set(feedbackPhase, resolvePhaseLabel(feedbackPhase))
  }

  return [...phaseMap.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

function resolveCaseDataEntries(payload: SoftphoneCallHistoryDisplayEntry['generatedCaseData']) {
  if (payload == null) {
    return []
  }

  return Object.entries(payload.values).map(([key, value]) => ({
    key,
    value: formatScenarioValue(value),
  }))
}

function resolveEnabledScenarioFeatures(entry: SoftphoneCallHistoryDisplayEntry) {
  return Object.entries(entry.scenarioSnapshot?.config?.features ?? {})
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature)
}

function ChartPanel(props: {
  children: React.ReactNode
  className?: string
  title: string
}) {
  return (
    <div className={['rounded-lg border bg-card p-4', props.className ?? ''].join(' ')}>
      <p className="text-sm font-medium text-foreground">{props.title}</p>
      {props.children}
    </div>
  )
}

function DetailRow(props: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
      <div className="max-w-[16rem] break-all text-right text-sm text-foreground">{props.value}</div>
    </div>
  )
}

function ExpandableDetailsSection(props: {
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
  title: string
}) {
  const [isOpen, setIsOpen] = useState(props.defaultOpen ?? false)

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
      >
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <div className="flex items-center gap-3">
          {props.badge ? <Badge variant="outline">{props.badge}</Badge> : null}
          <ChevronDown className={['size-4 text-muted-foreground transition-transform', isOpen ? 'rotate-180' : 'rotate-0'].join(' ')} />
        </div>
      </button>
      {isOpen ? <div className="border-t px-4 py-4">{props.children}</div> : null}
    </div>
  )
}

function DataSnapshotCard(props: {
  emptyLabel: string
  entries: Array<{ key: string, value: string }>
  title: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{props.title}</p>
      {props.entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{props.emptyLabel}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {props.entries.map((entry) => (
            <div className="rounded-md bg-muted/40 px-3 py-2" key={entry.key}>
              <p className="font-mono text-xs text-muted-foreground">{entry.key}</p>
              <p className="mt-0.5 break-all text-sm text-foreground">{entry.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function resolveFeedbackBadge(feedback: SoftphoneCallFeedback | null | undefined) {
  if (feedback?.sentiment === 'up') {
    return (
      <Badge className="border-transparent bg-primary/10 text-primary" variant="outline">
        <ThumbsUp className="size-3" />
        Thumbs up
      </Badge>
    )
  }

  if (feedback?.sentiment === 'down') {
    return (
      <Badge variant="destructive">
        <ThumbsDown className="size-3" />
        Thumbs down
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      No feedback
    </Badge>
  )
}

function TextEventTimeline(props: {
  emptyLabel: string
  events: SoftphoneCallHistoryTextEvent[]
}) {
  if (props.events.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">{props.emptyLabel}</p>
  }

  return (
    <div className="mt-3 grid gap-2">
      {props.events.map((event, index) => (
        <div className="rounded-md border bg-muted/30 p-3" key={`${event.timestamp}-${index}`}>
          <p className="text-xs font-medium text-muted-foreground">{formatDateTime(event.timestamp)}</p>
          <pre className="mt-2 max-w-full whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
            {event.text}
          </pre>
        </div>
      ))}
    </div>
  )
}

export function SoftphoneCallHistoryCard(props: {
  clearHistory?: () => void
  history: SoftphoneCallHistoryDisplayEntry[]
  hydrated: boolean
  maskSensitiveValues?: boolean
  mode?: 'admin' | 'local'
  toolbar?: React.ReactNode
}) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [filterFromDate, setFilterFromDate] = useState<string>('')
  const [feedbackFilter, setFeedbackFilter] = useState<SoftphoneHistoryFeedbackFilter>('all')
  const [phaseFilter, setPhaseFilter] = useState<SoftphoneHistoryPhaseFilter>('all')
  const mode = props.mode ?? 'local'
  const isAdminMode = mode === 'admin'
  const hiddenValue = '************'
  const isFiltering = filterFromDate.length > 0 || feedbackFilter !== 'all' || phaseFilter !== 'all'
  const fromDateMs = useMemo(() => resolveLocalDateMidnightMs(filterFromDate), [filterFromDate])
  const phaseOptions = useMemo(() => resolveSoftphoneHistoryPhaseOptions(props.history), [props.history])
  const selectedPhaseLabel = useMemo(
    () => phaseOptions.find((option) => option.id === phaseFilter)?.label ?? 'Any',
    [phaseFilter, phaseOptions],
  )
  const filteredHistory = useMemo(() => (
    props.history.filter((entry) => {
      if (fromDateMs != null) {
        const endedAtMs = new Date(entry.endedAt).getTime()

        if (Number.isNaN(endedAtMs) || endedAtMs < fromDateMs) {
          return false
        }
      }

      if (feedbackFilter === 'up') {
        if (entry.feedback?.sentiment !== 'up') {
          return false
        }
      }

      if (feedbackFilter === 'down') {
        if (entry.feedback?.sentiment !== 'down') {
          return false
        }
      }

      if (phaseFilter === 'all') {
        return true
      }

      return entry.feedback?.phaseGroup === phaseFilter
    })
  ), [feedbackFilter, fromDateMs, phaseFilter, props.history])
  const summary = useMemo(() => getSoftphoneCallHistorySummary(filteredHistory), [filteredHistory])
  const durationTrend = useMemo(() => getSoftphoneCallDurationTrend(filteredHistory), [filteredHistory])
  const feedbackOverviewData = useMemo(() => getSoftphoneFeedbackOverviewData(filteredHistory), [filteredHistory])
  const negativeFeedbackByPhaseData = useMemo(() => getSoftphoneNegativeFeedbackByPhaseData(filteredHistory), [filteredHistory])
  const phaseReachData = useMemo(() => getSoftphonePhaseReachData(filteredHistory), [filteredHistory])
  const averageElapsedToStep = useMemo(() => getSoftphoneAverageElapsedToStep(filteredHistory), [filteredHistory])
  const selectedEntry = useMemo(
    () => (selectedEntryId == null ? null : filteredHistory.find((entry) => entry.id === selectedEntryId) ?? null),
    [filteredHistory, selectedEntryId],
  )
  const selectedEntryPhases = selectedEntry?.phases ?? []
  const selectedEntryIntents = selectedEntry?.intents ?? []
  const selectedScenarioProfiles = selectedEntry?.scenarioSnapshot?.config?.profiles ?? []
  const selectedScenarioPhases = selectedEntry?.scenarioSnapshot?.config?.phases ?? []
  const selectedScenarioFields = selectedEntry?.scenarioSnapshot?.config?.recognizedFields ?? []
  const generatedCaseDataEntries = useMemo(
    () => (selectedEntry == null ? [] : resolveCaseDataEntries(selectedEntry.generatedCaseData)),
    [selectedEntry],
  )
  const recognizedCaseDataEntries = useMemo(
    () => (selectedEntry == null ? [] : resolveCaseDataEntries(selectedEntry.recognizedData)),
    [selectedEntry],
  )
  const enabledScenarioFeatures = useMemo(
    () => (selectedEntry == null ? [] : resolveEnabledScenarioFeatures(selectedEntry)),
    [selectedEntry],
  )

  function handleClearFilters() {
    setFilterFromDate('')
    setFeedbackFilter('all')
    setPhaseFilter('all')
  }

  function handleExportMarkdown() {
    if (filteredHistory.length === 0) {
      return
    }

    const scenarioId = (() => {
      const ids = new Set(filteredHistory.map((entry) => entry.scenarioId).filter((value): value is string => Boolean(value)))
      return ids.size === 1 ? [...ids][0] : null
    })()
    const baseFilename = [
      'softphone-call-details',
      mode,
      scenarioId,
      filterFromDate || null,
      feedbackFilter !== 'all' ? feedbackFilter : null,
      phaseFilter !== 'all' ? phaseFilter : null,
      new Date().toISOString().slice(0, 10),
    ]
      .filter((value): value is string => Boolean(value))
      .map(sanitizeFilename)
      .join('_')

    downloadMarkdownFile(
      `${baseFilename}.md`,
      buildCallHistoryMarkdownExport({
        calls: filteredHistory,
        feedbackFilter,
        phaseFilter,
        phaseFilterLabel: selectedPhaseLabel,
        fromDate: filterFromDate,
        generatedAt: new Date(),
        mode,
        totalCalls: props.history.length,
        visibleCalls: filteredHistory.length,
      }),
    )
  }

  return (
    <>
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-0.5">
              <CardTitle>{isAdminMode ? 'Call history' : 'Call history'}</CardTitle>
              <CardDescription>
                {isAdminMode
                  ? 'Persisted softphone calls across all sessions.'
                  : 'Completed softphone calls stored in this browser.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {props.toolbar}
              {props.clearHistory ? (
                <Button disabled={props.history.length === 0} size="sm" variant="outline" onClick={props.clearHistory}>
                  <Trash2 className="size-3.5" />
                  Clear history
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: 'Calls',
                value: summary.totalCalls,
              },
              {
                label: 'Avg journey',
                value: formatSoftphoneDuration(summary.averageJourneyDurationMs),
              },
              {
                label: 'Avg total',
                value: formatSoftphoneDuration(summary.averageTotalDurationMs),
              },
              {
                label: 'Feedback rate',
                value: formatPercentage(summary.feedbackRate),
              },
              {
                label: 'Positive rate',
                value: formatPercentage(summary.positiveRate),
              },
            ].map((item) => (
              <div className="rounded-lg border bg-card px-4 py-3" key={item.label}>
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          {props.hydrated && filteredHistory.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <ChartPanel title="Duration trend (last 12 calls)">
                <ChartContainer className="mt-3 h-[200px] w-full" config={durationConfig}>
                  <AreaChart data={durationTrend}>
                    <defs>
                      <linearGradient id="softphoneJourneyFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-journeyMinutes)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-journeyMinutes)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="call" tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area dataKey="journeyMinutes" fill="url(#softphoneJourneyFill)" fillOpacity={1} stroke="var(--color-journeyMinutes)" strokeWidth={2} type="monotone" />
                    <Area dataKey="totalMinutes" fillOpacity={0} stroke="var(--color-totalMinutes)" strokeDasharray="5 5" strokeWidth={1.5} type="monotone" />
                  </AreaChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel title="Calls reaching each phase">
                <ChartContainer className="mt-3 h-[200px] w-full" config={stepReachConfig}>
                  <BarChart data={phaseReachData}>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="step" tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="reached" fill="var(--color-reached)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel title="Feedback overview">
                <ChartContainer className="mt-3 h-[200px] w-full" config={feedbackOverviewConfig}>
                  <BarChart data={feedbackOverviewData}>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="sentiment" tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel title="Negative feedback by phase">
                <ChartContainer className="mt-3 h-[200px] w-full" config={negativePhaseConfig}>
                  <BarChart data={negativeFeedbackByPhaseData}>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="step" tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>

              <ChartPanel className="xl:col-span-2" title="Average time to reach each phase">
                <ChartContainer className="mt-3 h-[200px] w-full" config={elapsedConfig}>
                  <BarChart data={averageElapsedToStep}>
                    <CartesianGrid vertical={false} />
                    <XAxis axisLine={false} dataKey="step" tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="seconds" fill="var(--color-seconds)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </ChartPanel>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              {props.history.length === 0
                ? 'No stored calls yet. Completed softphone calls appear here.'
                : 'No calls match the current filters.'}
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">From date</Label>
                  <Input
                    className="h-8 w-40"
                    max={resolveTodayDateInputMax()}
                    onChange={(event) => setFilterFromDate(event.target.value)}
                    type="date"
                    value={filterFromDate}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Feedback</Label>
                  <Select value={feedbackFilter} onValueChange={(value) => setFeedbackFilter(value as SoftphoneHistoryFeedbackFilter)}>
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All calls</SelectItem>
                      <SelectItem value="up">Thumbs up</SelectItem>
                      <SelectItem value="down">Thumbs down</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Phase</Label>
                  <Select value={phaseFilter} onValueChange={(value) => setPhaseFilter(value)}>
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All phases</SelectItem>
                      {phaseOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isFiltering ? (
                  <Button
                    className="h-8"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={handleClearFilters}
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {filteredHistory.length}
                  {isFiltering ? <span className="text-muted-foreground"> / {props.history.length}</span> : null}
                </Badge>
                <Button
                  disabled={filteredHistory.length === 0}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={handleExportMarkdown}
                >
                  <Download className="size-3.5" />
                  Export
                </Button>
              </div>
            </div>

            {props.history.length > 0 && filteredHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No calls match the current filters.
              </div>
            ) : null}

            {filteredHistory.length === 0 ? null : (
              <ScrollArea className="h-[320px] rounded-lg border bg-card">
                <div className="grid">
                  {filteredHistory.map((entry) => (
                    <button
                      className="grid gap-1.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                      key={entry.id}
                      onClick={() => setSelectedEntryId(entry.id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{entry.profileName ?? 'Softphone call'}</span>
                          {resolveFeedbackBadge(entry.feedback)}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.endedAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Journey {formatSoftphoneDuration(entry.totalDurationWithoutInitMs)}</span>
                        <span>Total {formatSoftphoneDuration(entry.totalDurationMs)}</span>
                        <span>{(entry.phases ?? []).length} phases</span>
                        {entry.correlationCode ? <span className="font-mono">{props.maskSensitiveValues ? hiddenValue : entry.correlationCode}</span> : null}
                        {isAdminMode ? (
                          <span>{entry.operator?.email ?? entry.operator?.name ?? 'Anonymous'}</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedEntry != null} onOpenChange={(open) => !open && setSelectedEntryId(null)}>
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-5xl">
          {selectedEntry == null ? null : (
            <>
              <DialogHeader>
                <DialogTitle>{selectedEntry.profileName ?? 'Softphone call details'}</DialogTitle>
                <DialogDescription>
                  {formatDateTime(selectedEntry.startedAt)} to {formatDateTime(selectedEntry.endedAt)}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="grid gap-5">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ['Journey duration', formatSoftphoneDuration(selectedEntry.totalDurationWithoutInitMs)],
                      ['Total duration', formatSoftphoneDuration(selectedEntry.totalDurationMs)],
                      ['Correlation code', props.maskSensitiveValues && selectedEntry.correlationCode ? hiddenValue : selectedEntry.correlationCode ?? '-'],
                      ['ACS call id', props.maskSensitiveValues && selectedEntry.callIdentifier ? hiddenValue : selectedEntry.callIdentifier ?? '-'],
                      ['Final call state', selectedEntry.finalCallState ?? '-'],
                      ['Phases / intents', `${selectedEntryPhases.length} / ${selectedEntryIntents.length}`],
                      ['Started', formatDateTimeWithSeconds(selectedEntry.startedAt)],
                      ['Ended', formatDateTimeWithSeconds(selectedEntry.endedAt)],
                    ].map(([label, value]) => (
                      <div className="rounded-md border bg-muted/30 px-3 py-2" key={label}>
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="mt-0.5 break-all text-sm text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    {isAdminMode ? (
                      <div className="rounded-lg border bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Operator</p>
                        <div className="mt-3 grid gap-2">
                          <DetailRow label="Name" value={selectedEntry.operator?.name ?? '-'} />
                          <DetailRow label="Email" value={selectedEntry.operator?.email ?? 'Anonymous session'} />
                          <DetailRow label="Role" value={selectedEntry.operator?.role ?? '-'} />
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-sm font-medium text-foreground">Profile snapshot</p>
                      <div className="mt-3 grid gap-2">
                        <DetailRow label="Profile" value={selectedEntry.profileSnapshot?.name ?? selectedEntry.profileName ?? '-'} />
                        <DetailRow label="Profile id" value={<span className="font-mono text-xs">{selectedEntry.profileSnapshot?.id ?? selectedEntry.profileId ?? '-'}</span>} />
                        <DetailRow label="Primary" value={<span className="font-mono text-xs">{props.maskSensitiveValues && selectedEntry.profileSnapshot?.primaryPhoneNumber ? hiddenValue : selectedEntry.profileSnapshot?.primaryPhoneNumber ?? '-'}</span>} />
                        <DetailRow label="Caller ID" value={<span className="font-mono text-xs">{props.maskSensitiveValues && selectedEntry.profileSnapshot?.alternateCallerId ? hiddenValue : selectedEntry.profileSnapshot?.alternateCallerId ?? '-'}</span>} />
                      </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-sm font-medium text-foreground">Scenario snapshot</p>
                      <div className="mt-3 grid gap-2">
                        <DetailRow label="Scenario" value={selectedEntry.scenarioSnapshot?.name ?? selectedEntry.scenarioName ?? '-'} />
                        <DetailRow label="Scenario id" value={<span className="font-mono text-xs">{selectedEntry.scenarioSnapshot?.id ?? selectedEntry.scenarioId ?? '-'}</span>} />
                        <DetailRow label="Profiles / phases / fields" value={`${selectedScenarioProfiles.length} / ${selectedScenarioPhases.length} / ${selectedScenarioFields.length}`} />
                        <div className="rounded-md bg-muted/40 px-3 py-2">
                          <p className="text-xs font-medium text-muted-foreground">Enabled features</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {enabledScenarioFeatures.length > 0 ? (
                              enabledScenarioFeatures.map((feature) => (
                                <Badge key={feature} variant="outline">{feature}</Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No enabled features</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <DataSnapshotCard
                      emptyLabel="No generated case data was stored for this call."
                      entries={generatedCaseDataEntries}
                      title="Generated case data"
                    />
                    <DataSnapshotCard
                      emptyLabel="No recognized case data was stored for this call."
                      entries={recognizedCaseDataEntries}
                      title="Recognized case data"
                    />
                    <div className="rounded-lg border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">Feedback</p>
                        {resolveFeedbackBadge(selectedEntry.feedback)}
                      </div>
                      {selectedEntry.feedback == null ? (
                        <p className="mt-3 text-sm text-muted-foreground">No feedback submitted for this call.</p>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          <DetailRow label="Sentiment" value={selectedEntry.feedback.sentiment === 'up' ? 'Thumbs up' : 'Thumbs down'} />
                          <DetailRow label="Phase" value={resolveSoftphonePhaseGroupTitle(selectedEntry.feedback.phaseGroup, selectedEntry.scenarioSnapshot) ?? '-'} />
                          <DetailRow label="Severity" value={selectedEntry.feedback.severityRating == null ? '-' : `${selectedEntry.feedback.severityRating}/5`} />
                          <DetailRow label="Submitted" value={formatDateTime(selectedEntry.feedback.submittedAt)} />
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            <p className="text-xs font-medium text-muted-foreground">Note</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{selectedEntry.feedback.note ?? '-'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <ExpandableDetailsSection
                    badge={`${selectedEntryPhases.length}`}
                    title="Phase timeline"
                  >
                    <div className="grid gap-2">
                      {selectedEntryPhases.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No phase events were stored for this call.</p>
                      ) : (
                        selectedEntryPhases.map((phase) => (
                          <div className="grid gap-1 rounded-md border px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4" key={`${phase.phaseId}-${phase.timestamp}`}>
                            <span className="text-sm font-medium text-foreground">
                              {resolveSoftphonePhaseGroupTitle(phase.phaseId, selectedEntry.scenarioSnapshot) ?? phase.phaseId}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDateTimeWithSeconds(phase.timestamp)}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              +{formatSoftphoneDuration(Math.max(new Date(phase.timestamp).getTime() - new Date(selectedEntry.journeyStartedAt).getTime(), 0))}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </ExpandableDetailsSection>

                  <ExpandableDetailsSection
                    badge={`${(selectedEntry.ivrRawTextEvents ?? []).length + (selectedEntry.debugInformationEvents ?? []).length}`}
                    title="Raw IVR text and debug timelines"
                  >
                    <div className="grid gap-6 xl:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">IVR raw text</p>
                        <TextEventTimeline emptyLabel="No IVR raw text was stored for this call." events={selectedEntry.ivrRawTextEvents ?? []} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Debug information</p>
                        <TextEventTimeline emptyLabel="No debug information was stored for this call." events={selectedEntry.debugInformationEvents ?? []} />
                      </div>
                    </div>
                  </ExpandableDetailsSection>

                  <ExpandableDetailsSection
                    badge={`${generatedCaseDataEntries.length + recognizedCaseDataEntries.length + selectedEntryIntents.length}`}
                    title="Raw payloads"
                  >
                    <div className="grid gap-3 xl:grid-cols-2">
                      {([
                        ['Generated case data JSON', selectedEntry.generatedCaseData],
                        ['Recognized case data JSON', selectedEntry.recognizedData],
                        ['Scenario snapshot JSON', selectedEntry.scenarioSnapshot],
                        ['Intents JSON', selectedEntryIntents],
                      ] as const).map(([title, payload]) => (
                        <div className="rounded-lg border bg-muted/30 p-4" key={title}>
                          <p className="text-sm font-medium text-foreground">{title}</p>
                          <pre className="mt-3 max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                            {renderJson(payload)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </ExpandableDetailsSection>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
