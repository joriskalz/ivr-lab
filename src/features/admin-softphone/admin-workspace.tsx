import { createContext, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Link, Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SoftphoneCallHistoryCard } from '@/features/softphone/softphone-call-history-card'
import { authClient } from '@/features/auth/client'
import { adminSoftphoneDashboardQueryOptions } from '@/features/admin-softphone/dashboard-query'
import { useAdminHeaderStore } from '@/features/admin-softphone/header-store'
import {
  deleteAdminSoftphoneScenario,
  deleteAdminSoftphoneScenarioHistory,
  replaceAdminSoftphoneScenarioManagers,
  saveAdminSoftphoneScenario,
  updateAdminSoftphoneUserRole,
} from '@/features/admin-softphone/server'
import { type AppUserRole } from '@/features/auth/roles'
import type { AdminAuthProvider, AdminSoftphoneDashboardData } from '@/features/admin-softphone/types'
import {
  createDefaultSoftphoneScenarioConfig,
  normalizeSoftphoneScenarioConfig,
  normalizeScenarioKey,
} from '@/features/softphone/scenario'
import { SoftphoneInformationSurface } from '@/features/softphone/softphone-information'
import { secureRandomDigits } from '@/lib/secure-random'
import { normalizeSoftphoneBrandColor } from '@/features/softphone/theme'
import { cn } from '@/lib/utils'
import type {
  SoftphoneScenarioConfig,
  SoftphoneScenarioFieldType,
  SoftphoneScenarioProfileConfig,
  SoftphoneTestScenarioRecord,
} from '@/features/softphone/types'

const providerLabels: Record<AdminAuthProvider, string> = {
  github: 'GitHub',
  google: 'Google',
}
const roleLabels: Record<AppUserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  reader: 'Reader',
  user: 'User',
}
const roleOptions: AppUserRole[] = ['admin', 'manager', 'reader', 'user']

const FIELD_TYPE_OPTIONS: SoftphoneScenarioFieldType[] = ['text', 'number', 'date', 'enum', 'boolean']
const AUTO_SAVE_DELAY_MS = 900
const ghostInputClassName = 'rounded-md border-transparent bg-transparent shadow-none transition-colors hover:border-input focus-visible:border-ring dark:bg-transparent'
const COPY_FEEDBACK_RESET_MS = 2400

type AuthorizedAdminWorkspaceData = Extract<AdminSoftphoneDashboardData, { status: 'authorized' }>

type ScenarioDraft = {
  accessKey: string
  config: SoftphoneScenarioConfig
  id?: string | null
  name: string
}

type ScenarioProfileDraft = SoftphoneScenarioProfileConfig

type AutosaveState = 'error' | 'idle' | 'saved' | 'saving'

type AdminWorkspaceContextValue = {
  data: AuthorizedAdminWorkspaceData
}

const AdminWorkspaceContext = createContext<AdminWorkspaceContextValue | null>(null)

function createEmptyScenarioDraft(): ScenarioDraft {
  return {
    accessKey: '',
    config: createDefaultSoftphoneScenarioConfig(),
    id: null,
    name: 'New scenario',
  }
}

function createDraftFromScenario(scenario: SoftphoneTestScenarioRecord): ScenarioDraft {
  return {
    accessKey: scenario.accessKey,
    config: JSON.parse(JSON.stringify(scenario.config)) as SoftphoneScenarioConfig,
    id: scenario.id,
    name: scenario.name,
  }
}

function createScenarioInformationContext(scenario: SoftphoneTestScenarioRecord) {
  return {
    accessKey: scenario.accessKey,
    activeProfile: scenario.config.profiles[0] ?? null,
    correlationCode: null,
    externalEndpointBundle: null,
    features: scenario.config.features,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    softphoneUrl: typeof window !== 'undefined' ? `${window.location.origin}/softphone/${scenario.id}` : null,
  }
}

function createScenarioClipboardPayload(draft: ScenarioDraft) {
  return {
    accessKey: draft.accessKey,
    config: draft.config,
    name: draft.name,
  }
}

function serializeScenarioDraft(draft: ScenarioDraft) {
  return JSON.stringify({
    accessKey: draft.accessKey,
    config: draft.config,
    id: draft.id ?? null,
    name: draft.name,
  })
}

function formatAutosaveTimestamp(value: Date) {
  return value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

async function persistScenarioDraft(args: {
  fingerprint: string
  nextDraft: ScenarioDraft
  onSaveScenario: (draft: ScenarioDraft) => Promise<SoftphoneTestScenarioRecord>
  saveSequenceRef: MutableRefObject<number>
  savedStateResetRef: MutableRefObject<number | null>
  setAutosaveErrorMessage: (value: string | null) => void
  setAutosaveState: (value: AutosaveState | ((currentValue: AutosaveState) => AutosaveState)) => void
  setDraft: (value: ScenarioDraft | ((currentValue: ScenarioDraft) => ScenarioDraft)) => void
  setLastSavedAt: (value: Date) => void
  setLastSavedFingerprint: (value: string) => void
}) {
  const saveSequence = ++args.saveSequenceRef.current
  args.setAutosaveState('saving')
  args.setAutosaveErrorMessage(null)

  try {
    const savedScenario = await args.onSaveScenario(args.nextDraft)
    const normalizedDraft = createDraftFromScenario(savedScenario)
    const normalizedFingerprint = serializeScenarioDraft(normalizedDraft)

    args.setLastSavedFingerprint(normalizedFingerprint)
    args.setDraft((currentValue) => (
      serializeScenarioDraft(currentValue) === args.fingerprint ? normalizedDraft : currentValue
    ))
    args.setAutosaveState('saved')
    args.setLastSavedAt(new Date())

    if (args.savedStateResetRef.current != null) {
      window.clearTimeout(args.savedStateResetRef.current)
    }

    args.savedStateResetRef.current = window.setTimeout(() => {
      if (args.saveSequenceRef.current === saveSequence) {
        args.setAutosaveState((currentValue) => (currentValue === 'saved' ? 'idle' : currentValue))
      }
    }, COPY_FEEDBACK_RESET_MS)
  } catch (error) {
    args.setAutosaveState('error')
    args.setAutosaveErrorMessage(error instanceof Error ? error.message : 'Unable to save scenario.')
    throw error
  }
}

function CopyFeedbackButton(props: {
  className?: string
  copiedLabel?: string
  defaultLabel: string
  onCopy: () => Promise<void>
}) {
  const [hasCopied, setHasCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  async function handleClick() {
    try {
      await props.onCopy()
      setHasCopied(true)

      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current)
      }

      resetTimeoutRef.current = window.setTimeout(() => {
        setHasCopied(false)
        resetTimeoutRef.current = null
      }, COPY_FEEDBACK_RESET_MS)
    } catch {
      setHasCopied(false)
    }
  }

  return (
    <Button className={props.className} size="sm" type="button" variant="outline" onClick={() => void handleClick()}>
      {hasCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {hasCopied ? (props.copiedLabel ?? 'Copied') : props.defaultLabel}
    </Button>
  )
}

function parseScenarioClipboardPayload(rawValue: string) {
  const parsedValue = JSON.parse(rawValue) as {
    accessKey?: unknown
    config?: unknown
    name?: unknown
  }

  if (parsedValue == null || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    throw new Error('Clipboard does not contain a valid scenario configuration.')
  }

  return {
    accessKey:
      typeof parsedValue.accessKey === 'string'
        ? parsedValue.accessKey.replace(/\D/g, '').slice(0, 5)
        : '',
    config: normalizeSoftphoneScenarioConfig(parsedValue.config),
    name:
      typeof parsedValue.name === 'string' && parsedValue.name.trim().length > 0
        ? parsedValue.name.trim()
        : 'Imported scenario',
  }
}

function useAdminWorkspace() {
  const context = useContext(AdminWorkspaceContext)

  if (context == null) {
    throw new Error('Admin workspace context is not available.')
  }

  return context
}

function AdminPanel(props: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border bg-card shadow-xs',
        props.className,
      )}
    >
      {props.children}
    </section>
  )
}

function AdminPanelHeader(props: {
  actions?: ReactNode
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{props.title}</h2>
        {props.description ? (
          <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  )
}

function AdminSectionBlock(props: {
  action?: ReactNode
  children: ReactNode
  description?: ReactNode
  title: string
}) {
  return (
    <section className="grid gap-4 border-t px-5 py-5 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
          {props.description ? (
            <p className="max-w-[78ch] text-sm leading-6 text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
        {props.action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{props.action}</div> : null}
      </div>
      {props.children}
    </section>
  )
}

function AdminDetailItem(props: {
  className?: string
  label: string
  value: ReactNode
}) {
  return (
    <div className={cn('grid gap-0.5 rounded-md border bg-muted/40 px-3 py-2', props.className)}>
      <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
      <div className="min-w-0 text-sm text-foreground">{props.value}</div>
    </div>
  )
}

function AdminEmptyState(props: {
  action?: ReactNode
  description: string
  title: string
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-dashed bg-muted/30 px-5 py-6 text-sm">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{props.title}</p>
        <p className="leading-6 text-muted-foreground">{props.description}</p>
      </div>
      {props.action}
    </div>
  )
}

function AdminAccessCard(props: {
  children?: ReactNode
  description: string
  fullscreen?: boolean
  icon?: ReactNode
  title: string
}) {
  return (
    <div className={cn('grid place-items-center px-6 py-10', props.fullscreen ? 'min-h-svh bg-background' : 'min-h-[50vh]')}>
      <div className="grid w-full max-w-md gap-5 rounded-lg border bg-card p-8 shadow-xs">
        <div className="grid gap-3">
          {props.icon}
          <div className="grid gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{props.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{props.description}</p>
          </div>
        </div>
        {props.children}
      </div>
    </div>
  )
}

export function AdminWorkspaceLayout() {
  const [pendingProvider, setPendingProvider] = useState<AdminAuthProvider | null>(null)
  const queryClient = useQueryClient()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isWorkspaceLabRoute = pathname === '/admins/person' || pathname === '/admins/address'
  const dashboardQuery = useQuery(adminSoftphoneDashboardQueryOptions)

  async function handleSignIn(provider: AdminAuthProvider) {
    setPendingProvider(provider)

    try {
      await authClient.signIn.social({
        callbackURL: '/admins/scenarios',
        provider,
      })
    } finally {
      setPendingProvider(null)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    await queryClient.invalidateQueries({ queryKey: adminSoftphoneDashboardQueryOptions.queryKey })
  }

  if (isWorkspaceLabRoute) {
    return <Outlet />
  }

  if (dashboardQuery.isLoading || dashboardQuery.data == null) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading workspace...
        </div>
      </div>
    )
  }

  if (dashboardQuery.data.status === 'unauthenticated') {
    return (
      <AdminAccessCard
        fullscreen
        icon={(
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FlaskConical className="size-5" strokeWidth={2} />
          </div>
        )}
        title="Admin sign-in"
        description="Sign in with an allowed account to manage scenarios, users, and call analytics."
      >
        {dashboardQuery.data.providers.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
            No sign-in provider is configured. Add Google or GitHub credentials to the environment first.
          </div>
        ) : (
          <div className="grid gap-2">
            {dashboardQuery.data.providers.map((provider) => (
              <Button
                disabled={pendingProvider != null}
                key={provider}
                onClick={() => void handleSignIn(provider)}
              >
                {pendingProvider === provider ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Continue with {providerLabels[provider]}
              </Button>
            ))}
          </div>
        )}
      </AdminAccessCard>
    )
  }

  if (dashboardQuery.data.status === 'forbidden') {
    return (
      <AdminAccessCard
        icon={(
          <div className="flex size-10 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <ShieldAlert className="size-5" />
          </div>
        )}
        title="No admin access"
        description="This account is signed in but has no admin role and no scenario assignment. Ask an existing admin to grant access."
      >
        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{dashboardQuery.data.viewer.name}</p>
            <p className="truncate text-muted-foreground">{dashboardQuery.data.viewer.email}</p>
          </div>
          <Button variant="outline" onClick={() => void handleSignOut()}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </AdminAccessCard>
    )
  }

  if ((pathname === '/admins' || pathname === '/admins/') && dashboardQuery.data.status === 'authorized') {
    return <Navigate to={dashboardQuery.data.permissions.canViewScenarios ? '/admins/scenarios' : '/admins/analytics'} />
  }

  return (
    <AdminWorkspaceContext.Provider
      value={{
        data: dashboardQuery.data,
      }}
    >
      <Outlet />
    </AdminWorkspaceContext.Provider>
  )
}

function createEmptyScenarioProfileDraft(index: number): ScenarioProfileDraft {
  return {
    acsAccessKey: '',
    acsEndpoint: 'https://example.communication.azure.com',
    alternateCallerId: '+491701234569',
    id: `profile_${index + 1}`,
    name: `Profile ${index + 1}`,
    primaryPhoneNumber: '+491701234567',
    titleText: '',
  }
}

function updateScenarioDraftProfile(
  draft: ScenarioDraft,
  profileIndex: number,
  updater: (profile: ScenarioProfileDraft) => ScenarioProfileDraft,
) {
  return {
    ...draft,
    config: {
      ...draft.config,
      profiles: draft.config.profiles.map((profile, currentIndex) => (
        currentIndex === profileIndex ? updater(profile) : profile
      )),
    },
  }
}

type ScenarioFieldDraft = SoftphoneScenarioConfig['recognizedFields'][number]

function ScenarioEditorCard(props: {
  className?: string
  initialDraft: ScenarioDraft
  onCopyScenarioAccessKey: (accessKey: string) => Promise<void>
  onCopyScenarioUrl: (id: string) => Promise<void>
  onDeleteScenario?: () => void
  onSaveScenario: (draft: ScenarioDraft) => Promise<SoftphoneTestScenarioRecord>
}) {
  const { initialDraft, onCopyScenarioAccessKey, onCopyScenarioUrl, onSaveScenario } = props
  const clearAdminHeaderAutosave = useAdminHeaderStore((state) => state.clearAutosave)
  const setAdminHeaderAutosave = useAdminHeaderStore((state) => state.setAutosave)
  const [draft, setDraft] = useState<ScenarioDraft>(() => initialDraft)
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)
  const [clipboardMessageTone, setClipboardMessageTone] = useState<'error' | 'success'>('success')
  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null)
  const [expandedFieldIndex, setExpandedFieldIndex] = useState<number | null>(null)
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState<ScenarioProfileDraft>(() => createEmptyScenarioProfileDraft(0))
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
  const [autosaveErrorMessage, setAutosaveErrorMessage] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const initialFingerprint = useMemo(() => serializeScenarioDraft(initialDraft), [initialDraft])
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(initialFingerprint)
  const pendingAutosaveRef = useRef<number | null>(null)
  const saveSequenceRef = useRef(0)
  const savedStateResetRef = useRef<number | null>(null)
  const currentFingerprint = useMemo(() => serializeScenarioDraft(draft), [draft])
  const hasUnsavedChanges = currentFingerprint !== lastSavedFingerprint
  const canAutosave = draft.name.trim().length > 0

  function updateDraft(mutator: (currentValue: ScenarioDraft) => ScenarioDraft) {
    setDraft((currentValue) => mutator(currentValue))
  }

  async function handleCopyScenarioConfig() {
    await navigator.clipboard.writeText(JSON.stringify(createScenarioClipboardPayload(draft), null, 2))
    setClipboardMessage('Scenario config copied to the clipboard.')
    setClipboardMessageTone('success')
  }

  async function handlePasteScenarioConfig() {
    try {
      const clipboardValue = await navigator.clipboard.readText()
      const parsedValue = parseScenarioClipboardPayload(clipboardValue)

      setDraft((currentValue) => ({
        ...currentValue,
        accessKey: parsedValue.accessKey,
        config: parsedValue.config,
        name: parsedValue.name,
      }))
      setClipboardMessage('Scenario config pasted into the current draft.')
      setClipboardMessageTone('success')
    } catch (error) {
      setClipboardMessage(
        error instanceof Error ? error.message : 'Unable to paste the scenario config from the clipboard.',
      )
      setClipboardMessageTone('error')
    }
  }

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return
    }

    if (!canAutosave || isProfileDialogOpen) {
      return
    }

    if (pendingAutosaveRef.current != null) {
      window.clearTimeout(pendingAutosaveRef.current)
    }

    pendingAutosaveRef.current = window.setTimeout(() => {
      pendingAutosaveRef.current = null
      void persistScenarioDraft({
        fingerprint: currentFingerprint,
        nextDraft: draft,
        onSaveScenario,
        saveSequenceRef,
        savedStateResetRef,
        setAutosaveErrorMessage,
        setAutosaveState,
        setDraft,
        setLastSavedAt,
        setLastSavedFingerprint,
      })
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (pendingAutosaveRef.current != null) {
        window.clearTimeout(pendingAutosaveRef.current)
        pendingAutosaveRef.current = null
      }
    }
  }, [canAutosave, currentFingerprint, draft, hasUnsavedChanges, isProfileDialogOpen, onSaveScenario])

  const autosaveStatus = useMemo(() => {
    if (autosaveState === 'saving') {
      return { icon: 'saving' as const, label: 'Saving changes...', tone: 'default' as const }
    }

    if (autosaveState === 'error' && autosaveErrorMessage) {
      return { icon: 'idle' as const, label: autosaveErrorMessage, tone: 'error' as const }
    }

    if (!canAutosave) {
      return { icon: 'idle' as const, label: 'Enter a scenario name to start autosave.', tone: 'default' as const }
    }

    if (isProfileDialogOpen && hasUnsavedChanges) {
      return { icon: 'idle' as const, label: 'Finish editing the profile dialog to resume autosave.', tone: 'default' as const }
    }

    if (hasUnsavedChanges) {
      return { icon: 'idle' as const, label: 'Unsaved changes...', tone: 'default' as const }
    }

    if (autosaveState === 'saved' && lastSavedAt != null) {
      return { icon: 'saved' as const, label: `Saved at ${formatAutosaveTimestamp(lastSavedAt)}.`, tone: 'success' as const }
    }

    return { icon: 'idle' as const, label: 'Changes save automatically.', tone: 'default' as const }
  }, [autosaveErrorMessage, autosaveState, canAutosave, hasUnsavedChanges, isProfileDialogOpen, lastSavedAt])

  useEffect(() => {
    setAdminHeaderAutosave({
      isSaving: autosaveStatus.icon === 'saving',
      label: autosaveStatus.label,
      tone: autosaveStatus.tone,
    })
  }, [autosaveStatus, setAdminHeaderAutosave])

  useEffect(() => {
    return () => {
      clearAdminHeaderAutosave()
    }
  }, [clearAdminHeaderAutosave])

  function openCreateProfileDialog() {
    setEditingProfileIndex(null)
    setProfileDraft(createEmptyScenarioProfileDraft(draft.config.profiles.length))
    setIsProfileDialogOpen(true)
  }

  function openEditProfileDialog(profileIndex: number) {
    const profile = draft.config.profiles[profileIndex]

    if (profile == null) {
      return
    }

    setEditingProfileIndex(profileIndex)
    setProfileDraft({ ...profile })
    setIsProfileDialogOpen(true)
  }

  function saveProfileDraft() {
    updateDraft((currentValue) => {
      if (editingProfileIndex == null) {
        return {
          ...currentValue,
          config: {
            ...currentValue.config,
            profiles: [...currentValue.config.profiles, profileDraft],
          },
        }
      }

      return updateScenarioDraftProfile(currentValue, editingProfileIndex, () => profileDraft)
    })
    setIsProfileDialogOpen(false)
  }

  const canSaveProfile =
    profileDraft.id.trim().length > 0 &&
    profileDraft.name.trim().length > 0 &&
    profileDraft.primaryPhoneNumber.trim().length > 0 &&
    profileDraft.alternateCallerId.trim().length > 0 &&
    profileDraft.acsEndpoint.trim().length > 0 &&
    profileDraft.acsAccessKey.trim().length > 0

  const fieldEntries = draft.config.recognizedFields.map((field, index) => ({ field, index }))
  const phaseIds = new Set(draft.config.phases.map((phase) => phase.id))
  const unmappedFieldEntries = fieldEntries.filter((entry) => !phaseIds.has(entry.field.phaseId))

  function updateRecognizedField(fieldIndex: number, updater: (field: ScenarioFieldDraft) => ScenarioFieldDraft) {
    updateDraft((currentValue) => ({
      ...currentValue,
      config: {
        ...currentValue.config,
        recognizedFields: currentValue.config.recognizedFields.map((candidate, candidateIndex) => (
          candidateIndex === fieldIndex ? updater(candidate) : candidate
        )),
      },
    }))
  }

  function removeRecognizedField(fieldIndex: number) {
    setExpandedFieldIndex(null)
    updateDraft((currentValue) => ({
      ...currentValue,
      config: {
        ...currentValue.config,
        recognizedFields: currentValue.config.recognizedFields.filter((_, candidateIndex) => candidateIndex !== fieldIndex),
      },
    }))
  }

  function addRecognizedField(phaseId: string) {
    setExpandedFieldIndex(draft.config.recognizedFields.length)
    updateDraft((currentValue) => ({
      ...currentValue,
      config: {
        ...currentValue.config,
        recognizedFields: [
          ...currentValue.config.recognizedFields,
          {
            generatorValues: [],
            id: `field_${currentValue.config.recognizedFields.length + 1}`,
            label: `Field ${currentValue.config.recognizedFields.length + 1}`,
            phaseId,
            type: 'text',
          },
        ],
      },
    }))
  }

  function addPhase() {
    updateDraft((currentValue) => ({
      ...currentValue,
      config: {
        ...currentValue.config,
        phases: [
          ...currentValue.config.phases,
          {
            id: `phase_${currentValue.config.phases.length + 1}`,
            label: `Phase ${currentValue.config.phases.length + 1}`,
          },
        ],
      },
    }))
  }

  function movePhase(phaseIndex: number, delta: -1 | 1) {
    updateDraft((currentValue) => {
      const targetIndex = phaseIndex + delta

      if (targetIndex < 0 || targetIndex >= currentValue.config.phases.length) {
        return currentValue
      }

      const nextPhases = [...currentValue.config.phases]
      const movedPhase = nextPhases[phaseIndex]
      nextPhases[phaseIndex] = nextPhases[targetIndex]
      nextPhases[targetIndex] = movedPhase

      return {
        ...currentValue,
        config: {
          ...currentValue.config,
          phases: nextPhases,
        },
      }
    })
  }

  function renamePhase(phaseIndex: number, rawNextId: string) {
    const currentPhase = draft.config.phases[phaseIndex]

    if (currentPhase == null) {
      return
    }

    const nextId = normalizeScenarioKey(rawNextId, currentPhase.id)
    updateDraft((currentValue) => {
      const previousPhaseId = currentValue.config.phases[phaseIndex]?.id ?? currentPhase.id

      return {
        ...currentValue,
        config: {
          ...currentValue.config,
          phases: currentValue.config.phases.map((candidate, candidateIndex) => (
            candidateIndex === phaseIndex ? { ...candidate, id: nextId } : candidate
          )),
          recognizedFields: currentValue.config.recognizedFields.map((field) => (
            field.phaseId === previousPhaseId ? { ...field, phaseId: nextId } : field
          )),
        },
      }
    })
  }

  function removePhase(phaseIndex: number) {
    const phase = draft.config.phases[phaseIndex]

    if (phase == null) {
      return
    }

    updateDraft((currentValue) => ({
      ...currentValue,
      config: {
        ...currentValue.config,
        phases: currentValue.config.phases.filter((_, candidateIndex) => candidateIndex !== phaseIndex),
        recognizedFields: currentValue.config.recognizedFields.map((field) => (
          field.phaseId === phase.id
            ? {
                ...field,
                phaseId: currentValue.config.phases.find((candidate, candidateIndex) => candidateIndex !== phaseIndex)?.id ?? phase.id,
              }
            : field
        )),
      },
    }))
  }

  function renderFieldRow(entry: { field: ScenarioFieldDraft, index: number }) {
    const isExpanded = expandedFieldIndex === entry.index
    const valueCount = entry.field.generatorValues.filter((value) => value.trim().length > 0).length

    return (
      <div className={cn('rounded-md', isExpanded && 'bg-muted/40')} key={entry.index}>
        <button
          className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50"
          onClick={() => setExpandedFieldIndex(isExpanded ? null : entry.index)}
          type="button"
        >
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-44 truncate text-sm text-foreground">{entry.field.label || entry.field.id}</span>
            <span className="hidden font-mono text-xs text-muted-foreground/80 sm:inline">{entry.field.id}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {entry.field.type} · {valueCount} {valueCount === 1 ? 'value' : 'values'}
            </span>
            <ChevronDown className={cn('size-4 text-muted-foreground/60 transition-transform', isExpanded && 'rotate-180')} />
          </div>
        </button>
        {isExpanded ? (
          <div className="grid gap-3 px-3 pt-1.5 pb-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Label</Label>
                <Input
                  className="h-8"
                  value={entry.field.label}
                  onChange={(event) => updateRecognizedField(entry.index, (field) => ({ ...field, label: event.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Field id</Label>
                <Input
                  className="h-8 font-mono text-sm"
                  value={entry.field.id}
                  onChange={(event) => updateRecognizedField(entry.index, (field) => ({
                    ...field,
                    id: normalizeScenarioKey(event.target.value, field.id),
                  }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={entry.field.type}
                  onValueChange={(value) => updateRecognizedField(entry.index, (field) => ({
                    ...field,
                    type: value as SoftphoneScenarioFieldType,
                  }))}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Phase</Label>
                <Select
                  value={phaseIds.has(entry.field.phaseId) ? entry.field.phaseId : undefined}
                  onValueChange={(value) => updateRecognizedField(entry.index, (field) => ({ ...field, phaseId: value }))}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    {draft.config.phases.map((phase) => (
                      <SelectItem key={phase.id} value={phase.id}>
                        {phase.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Generator values (one per line, picked randomly per test call)</Label>
              <Textarea
                className="min-h-24 font-mono text-xs"
                placeholder="Enter one value per line"
                value={entry.field.generatorValues.join('\n')}
                onChange={(event) => updateRecognizedField(entry.index, (field) => ({
                  ...field,
                  generatorValues: event.target.value.split('\n'),
                }))}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" type="button" variant="ghost" onClick={() => removeRecognizedField(entry.index)}>
                <Trash2 className="size-3.5" />
                Remove field
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <AdminPanel className={props.className}>
      <AdminPanelHeader
        title={draft.id == null ? 'New scenario' : draft.name}
        description={draft.id == null
          ? 'Define phases, recognized fields, and ACS profiles. The scenario saves automatically.'
          : <span>Scenario <span className="font-mono text-xs">{draft.id}</span> · changes save automatically.</span>}
        actions={(
          <>
            {draft.id ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`/softphone/${draft.id}`} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-3.5" />
                    Open softphone
                  </a>
                </Button>
                <CopyFeedbackButton defaultLabel="Copy URL" onCopy={() => onCopyScenarioUrl(draft.id ?? '')} />
                <CopyFeedbackButton defaultLabel="Copy key" onCopy={() => onCopyScenarioAccessKey(draft.accessKey)} />
              </>
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <Button aria-label="More scenario actions" size="icon-sm" type="button" variant="outline">
                  <MoreHorizontal className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="grid w-52 gap-1 p-1.5">
                <Button
                  className="w-full justify-start"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void handleCopyScenarioConfig()}
                >
                  <Copy className="size-3.5" />
                  Copy config as JSON
                </Button>
                <Button
                  className="w-full justify-start"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void handlePasteScenarioConfig()}
                >
                  <Copy className="size-3.5" />
                  Paste config from JSON
                </Button>
                {props.onDeleteScenario ? (
                  <Button
                    className="w-full justify-start text-destructive hover:text-destructive"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={props.onDeleteScenario}
                  >
                    <Trash2 className="size-3.5" />
                    Delete scenario
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
          </>
        )}
      />

      <Tabs className="gap-0" defaultValue="general">
        <div className="border-b px-5 pt-2">
          <TabsList className="w-full justify-start gap-4 overflow-x-auto border-0 p-0" variant="line">
            <TabsTrigger className="h-9 flex-none px-1" value="general">
              General
            </TabsTrigger>
            <TabsTrigger className="h-9 flex-none px-1" value="flow">
              Call flow
            </TabsTrigger>
            <TabsTrigger className="h-9 flex-none px-1" value="profiles">
              Profiles ({draft.config.profiles.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general">
          <div className="grid">
            <AdminSectionBlock
              title="Core settings"
              description="Name, access key, and the brand color the public softphone uses for this scenario."
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.8fr)_minmax(14rem,1fr)]">
                <div className="grid gap-2">
                  <Label htmlFor="scenario-name">Scenario name</Label>
                  <Input
                    id="scenario-name"
                    value={draft.name}
                    onChange={(event) => updateDraft((currentValue) => ({
                      ...currentValue,
                      name: event.target.value,
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Identifier</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm text-foreground">
                    {draft.id ?? 'generated on save'}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scenario-access-key">Access key</Label>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono"
                      id="scenario-access-key"
                      inputMode="numeric"
                      maxLength={5}
                      pattern="[0-9]{5}"
                      placeholder="generated on save"
                      value={draft.accessKey}
                      onChange={(event) => updateDraft((currentValue) => ({
                        ...currentValue,
                        accessKey: event.target.value.replace(/\D/g, '').slice(0, 5),
                      }))}
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      type="button"
                      variant="outline"
                      onClick={() => updateDraft((currentValue) => ({
                        ...currentValue,
                        accessKey: secureRandomDigits(5),
                      }))}
                    >
                      Regenerate
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,14rem)]">
                <div className="grid gap-2">
                  <Label htmlFor="scenario-brand-color">Brand color</Label>
                  <Input
                    className="h-9 p-1"
                    id="scenario-brand-color"
                    type="color"
                    value={draft.config.brandColor}
                    onChange={(event) => updateDraft((currentValue) => ({
                      ...currentValue,
                      config: {
                        ...currentValue.config,
                        brandColor: normalizeSoftphoneBrandColor(event.target.value),
                      },
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scenario-brand-color-value">Hex value</Label>
                  <Input
                    className="font-mono"
                    id="scenario-brand-color-value"
                    placeholder="#4e733c"
                    value={draft.config.brandColor}
                    onChange={(event) => updateDraft((currentValue) => ({
                      ...currentValue,
                      config: {
                        ...currentValue.config,
                        brandColor: normalizeSoftphoneBrandColor(event.target.value, currentValue.config.brandColor),
                      },
                    }))}
                  />
                </div>
              </div>
            </AdminSectionBlock>

            <AdminSectionBlock
              title="Softphone modules"
              description="Choose which panels the softphone shows for this scenario."
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ['debugInformation', 'Debug information'],
                  ['intents', 'Intent recognition'],
                  ['phases', 'Phase timeline'],
                  ['rawText', 'IVR raw text'],
                  ['recognizedData', 'Recognized data table'],
                ] as const).map(([key, label]) => (
                  <label className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" key={key}>
                    <input
                      checked={draft.config.features[key]}
                      className="size-4 accent-primary"
                      onChange={(event) => updateDraft((currentValue) => ({
                        ...currentValue,
                        config: {
                          ...currentValue.config,
                          features: {
                            ...currentValue.config.features,
                            [key]: event.target.checked,
                          },
                        },
                      }))}
                      type="checkbox"
                    />
                    <span className="font-medium text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </AdminSectionBlock>
          </div>
        </TabsContent>

        <TabsContent value="profiles">
          <div className="grid">
            <AdminSectionBlock
              action={(
                <Button size="sm" type="button" variant="outline" onClick={openCreateProfileDialog}>
                  <Plus className="size-3.5" />
                  Add profile
                </Button>
              )}
              title="ACS profiles"
              description="Phone routing and ACS connection details per profile."
            >
              {draft.config.profiles.length === 0 ? (
                <AdminEmptyState
                  title="No ACS profiles yet."
                  description="Create at least one profile with a phone number, caller ID, and ACS connection."
                />
              ) : (
                <div className="grid gap-3">
                  {draft.config.profiles.map((profile, index) => (
                    <div className="grid gap-3 rounded-lg border px-4 py-3.5" key={`${profile.id}-${index}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{profile.name}</p>
                          <Badge className="font-mono" variant="outline">{profile.id}</Badge>
                          {profile.titleText?.trim() ? (
                            <span className="text-xs text-muted-foreground">{profile.titleText}</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" type="button" variant="outline" onClick={() => openEditProfileDialog(index)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => updateDraft((currentValue) => ({
                              ...currentValue,
                              config: {
                                ...currentValue.config,
                                profiles: currentValue.config.profiles.filter((_, profileIndex) => profileIndex !== index),
                              },
                            }))}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <AdminDetailItem label="Primary" value={<span className="font-mono text-sm">{profile.primaryPhoneNumber}</span>} />
                        <AdminDetailItem label="Caller ID" value={<span className="font-mono text-sm">{profile.alternateCallerId}</span>} />
                        <AdminDetailItem label="ACS endpoint" value={<span className="break-all text-sm">{profile.acsEndpoint}</span>} />
                        <AdminDetailItem
                          label="ACS key"
                          value={<span className="font-mono text-sm">{profile.acsAccessKey ? `${profile.acsAccessKey.slice(0, 4)}...` : '-'}</span>}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminSectionBlock>
          </div>
        </TabsContent>

        <TabsContent value="flow">
          <div className="grid gap-5 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
                Phases run in call order. Click a field to edit it, or a phase name to rename it.
              </p>
              <Button size="sm" type="button" variant="outline" onClick={addPhase}>
                <Plus className="size-3.5" />
                Add phase
              </Button>
            </div>

            {draft.config.phases.length === 0 ? (
              <AdminEmptyState
                title="No phases yet."
                description="Add the first phase to define the call journey."
              />
            ) : (
              <div className="grid gap-4">
                {draft.config.phases.map((phase, phaseIndex) => {
                  const phaseFieldEntries = fieldEntries.filter((entry) => entry.field.phaseId === phase.id)

                  return (
                    <div className="group/phase" key={phaseIndex}>
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                          {phaseIndex + 1}
                        </span>
                        <Input
                          aria-label="Phase label"
                          className={cn('h-8 w-44 px-2 text-sm font-semibold', ghostInputClassName)}
                          value={phase.label}
                          onChange={(event) => updateDraft((currentValue) => ({
                            ...currentValue,
                            config: {
                              ...currentValue.config,
                              phases: currentValue.config.phases.map((candidate, candidateIndex) => (
                                candidateIndex === phaseIndex
                                  ? { ...candidate, label: event.target.value }
                                  : candidate
                              )),
                            },
                          }))}
                        />
                        <Input
                          aria-label="Phase id"
                          className={cn('h-8 w-full max-w-72 flex-1 px-2 font-mono text-xs text-muted-foreground', ghostInputClassName)}
                          value={phase.id}
                          onChange={(event) => renamePhase(phaseIndex, event.target.value)}
                        />
                        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/phase:opacity-100 group-hover/phase:opacity-100">
                          <Button
                            aria-label="Move phase up"
                            className="text-muted-foreground"
                            disabled={phaseIndex === 0}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                            onClick={() => movePhase(phaseIndex, -1)}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            aria-label="Move phase down"
                            className="text-muted-foreground"
                            disabled={phaseIndex === draft.config.phases.length - 1}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                            onClick={() => movePhase(phaseIndex, 1)}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            aria-label="Remove phase"
                            className="text-muted-foreground"
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                            onClick={() => removePhase(phaseIndex)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1 ml-3 grid gap-0.5 border-l border-border/70 pl-4">
                        {phaseFieldEntries.length === 0 ? (
                          <p className="px-2.5 py-1.5 text-xs text-muted-foreground/80">No fields recognized in this phase.</p>
                        ) : (
                          phaseFieldEntries.map((entry) => renderFieldRow(entry))
                        )}
                        <Button
                          className="w-fit justify-start px-2.5 text-muted-foreground hover:text-foreground"
                          size="xs"
                          type="button"
                          variant="ghost"
                          onClick={() => addRecognizedField(phase.id)}
                        >
                          <Plus className="size-3" />
                          Add field
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {unmappedFieldEntries.length > 0 ? (
              <div className="grid gap-1 rounded-lg border border-dashed p-3">
                <p className="px-2.5 text-sm font-semibold text-foreground">Unmapped fields</p>
                <p className="px-2.5 pb-1 text-xs text-muted-foreground">These fields reference a phase that no longer exists. Expand one to assign it to a phase.</p>
                {unmappedFieldEntries.map((entry) => renderFieldRow(entry))}
              </div>
            ) : null}
          </div>
        </TabsContent>

        {clipboardMessage ? (
          <div
            className={cn(
              'border-t px-5 py-3 text-sm',
              clipboardMessageTone === 'error'
                ? 'bg-destructive/5 text-destructive'
                : 'bg-primary/5 text-primary',
            )}
          >
            {clipboardMessage}
          </div>
        ) : null}
      </Tabs>

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProfileIndex == null ? 'Add ACS profile' : 'Edit ACS profile'}</DialogTitle>
            <DialogDescription>
              Phone routing and ACS connection details for this scenario profile.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="profile-id">Profile id</Label>
                <Input
                  className="font-mono"
                  id="profile-id"
                  value={profileDraft.id}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    id: normalizeScenarioKey(event.target.value, currentValue.id),
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={profileDraft.name}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-primary-number">Primary number</Label>
                <Input
                  className="font-mono"
                  id="profile-primary-number"
                  placeholder="+491701234567"
                  value={profileDraft.primaryPhoneNumber}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    primaryPhoneNumber: event.target.value,
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-caller-id">Alternate caller ID</Label>
                <Input
                  className="font-mono"
                  id="profile-caller-id"
                  placeholder="+491701234569"
                  value={profileDraft.alternateCallerId}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    alternateCallerId: event.target.value,
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-acs-endpoint">ACS endpoint</Label>
                <Input
                  id="profile-acs-endpoint"
                  placeholder="https://example.communication.azure.com"
                  value={profileDraft.acsEndpoint}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    acsEndpoint: event.target.value,
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-acs-key">ACS access key</Label>
                <Input
                  className="font-mono"
                  id="profile-acs-key"
                  value={profileDraft.acsAccessKey}
                  onChange={(event) => setProfileDraft((currentValue) => ({
                    ...currentValue,
                    acsAccessKey: event.target.value,
                  }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-title-text">Title text</Label>
              <Input
                id="profile-title-text"
                value={profileDraft.titleText ?? ''}
                onChange={(event) => setProfileDraft((currentValue) => ({
                  ...currentValue,
                  titleText: event.target.value,
                }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSaveProfile} type="button" onClick={saveProfileDraft}>
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPanel>
  )
}

function ScenarioActionMenu(props: {
  canDelete: boolean
  isDeletePending: boolean
  onCopyScenarioAccessKey: () => Promise<void>
  onCopyScenarioUrl: () => Promise<void>
  onDeleteScenario: () => void
  onOpenSoftphone: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  async function handleCopy(action: () => Promise<void>) {
    setIsOpen(false)
    await action()
  }

  function handleDelete() {
    setIsOpen(false)
    props.onDeleteScenario()
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button aria-label="Open scenario actions" size="icon-sm" type="button" variant="ghost">
          <MoreHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-52 gap-1 p-1.5">
        <Button
          className="w-full justify-start"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            setIsOpen(false)
            props.onOpenSoftphone()
          }}
        >
          <ExternalLink className="size-3.5" />
          Open softphone
        </Button>
        <Button
          className="w-full justify-start"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => void handleCopy(props.onCopyScenarioUrl)}
        >
          <Copy className="size-3.5" />
          Copy URL
        </Button>
        <Button
          className="w-full justify-start"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => void handleCopy(props.onCopyScenarioAccessKey)}
        >
          <Copy className="size-3.5" />
          Copy key
        </Button>
        {props.canDelete ? (
          <Button
            className="w-full justify-start text-destructive hover:text-destructive"
            disabled={props.isDeletePending}
            size="sm"
            type="button"
            variant="ghost"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Delete scenario
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

async function copyScenarioUrlToClipboard(id: string) {
  const origin = window.location.origin
  await navigator.clipboard.writeText(`${origin}/softphone/${id}`)
}

async function copyScenarioAccessKeyToClipboard(accessKey: string) {
  await navigator.clipboard.writeText(accessKey)
}

function openSoftphoneInNewTab(id: string) {
  window.open(`/softphone/${id}`, '_blank', 'noopener,noreferrer')
}

function ScenarioRestrictedCard() {
  return (
    <AdminAccessCard
      icon={(
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ShieldAlert className="size-5" />
        </div>
      )}
      title="Scenario editing is restricted"
      description="This role can open analytics, but scenario configuration is reserved for admins and managers."
    />
  )
}

export function AdminScenarioListPage() {
  const { data } = useAdminWorkspace()
  const queryClient = useQueryClient()
  const [scenarioPendingDeletion, setScenarioPendingDeletion] = useState<SoftphoneTestScenarioRecord | null>(null)
  const scenarioManagerNamesByScenarioId = useMemo(() => {
    const nextMap = new Map<string, string[]>()

    for (const user of data.users) {
      for (const scenarioId of user.managedScenarioIds) {
        const currentManagers = nextMap.get(scenarioId) ?? []
        currentManagers.push(user.name)
        nextMap.set(scenarioId, currentManagers)
      }
    }

    return nextMap
  }, [data.users])
  const deleteScenarioMutation = useMutation({
    mutationFn: async (scenarioId: string) => deleteAdminSoftphoneScenario({ data: { scenarioId } }),
    onSuccess: async ({ scenarioId }) => {
      queryClient.setQueryData(adminSoftphoneDashboardQueryOptions.queryKey, (currentValue: AdminSoftphoneDashboardData | undefined) => {
        if (currentValue == null || currentValue.status !== 'authorized') {
          return currentValue
        }

        return {
          ...currentValue,
          scenarios: currentValue.scenarios.filter((scenario) => scenario.id !== scenarioId),
          users: currentValue.users.map((user) => ({
            ...user,
            managedScenarioIds: user.managedScenarioIds.filter((managedScenarioId) => managedScenarioId !== scenarioId),
          })),
        }
      })
      setScenarioPendingDeletion(null)
    },
  })

  function dismissDeleteDialog() {
    setScenarioPendingDeletion(null)
    deleteScenarioMutation.reset()
  }

  function openDeleteDialog(scenario: SoftphoneTestScenarioRecord) {
    deleteScenarioMutation.reset()
    setScenarioPendingDeletion(scenario)
  }

  function handleConfirmDelete() {
    if (scenarioPendingDeletion == null) {
      return
    }

    deleteScenarioMutation.mutate(scenarioPendingDeletion.id)
  }

  if (!data.permissions.canViewScenarios) {
    return <ScenarioRestrictedCard />
  }

  return (
    <div className="grid gap-6">
      <AdminPanel>
        <AdminPanelHeader
          title="Scenarios"
          description="Select a scenario to edit its configuration, or create a new one."
          actions={data.permissions.canCreateScenarios ? (
            <Button asChild size="sm">
              <Link to="/admins/scenarios/new">
                <Plus className="size-3.5" />
                New scenario
              </Link>
            </Button>
          ) : null}
        />
        <div className="grid gap-2 p-3">
          {data.scenarios.length === 0 ? (
            <AdminEmptyState
              title="No scenarios assigned."
              description="Create a scenario if your role allows it, or wait for an administrator to assign one."
              action={data.permissions.canCreateScenarios ? (
                <Button asChild className="w-fit" size="sm" variant="outline">
                  <Link to="/admins/scenarios/new">
                    <Plus className="size-3.5" />
                    New scenario
                  </Link>
                </Button>
              ) : null}
            />
          ) : (
            data.scenarios.map((scenario) => {
              const managerNames = scenarioManagerNamesByScenarioId.get(scenario.id) ?? []

              return (
                <div
                  className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 transition-colors hover:border-primary/30 hover:bg-muted/30"
                  key={scenario.id}
                >
                  <Link
                    className="grid min-w-0 flex-1 gap-1"
                    params={{ scenarioId: scenario.id }}
                    to="/admins/scenarios/$scenarioId"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: scenario.config.brandColor }} />
                      <p className="truncate text-sm font-medium text-foreground">{scenario.name}</p>
                      <span className="font-mono text-xs text-muted-foreground">{scenario.id}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {scenario.config.phases.length} phases · {scenario.config.recognizedFields.length} fields · {scenario.config.profiles.length} {scenario.config.profiles.length === 1 ? 'profile' : 'profiles'} · key <span className="font-mono">{scenario.accessKey}</span>
                      {managerNames.length > 0 ? <> · {managerNames.join(', ')}</> : null}
                    </p>
                  </Link>
                  <ScenarioActionMenu
                    canDelete={data.viewer.role === 'admin'}
                    isDeletePending={deleteScenarioMutation.isPending}
                    onCopyScenarioAccessKey={() => copyScenarioAccessKeyToClipboard(scenario.accessKey)}
                    onCopyScenarioUrl={() => copyScenarioUrlToClipboard(scenario.id)}
                    onDeleteScenario={() => openDeleteDialog(scenario)}
                    onOpenSoftphone={() => openSoftphoneInNewTab(scenario.id)}
                  />
                </div>
              )
            })
          )}
        </div>
      </AdminPanel>

      <Dialog open={scenarioPendingDeletion != null} onOpenChange={(open) => !open && dismissDeleteDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete scenario?</DialogTitle>
            <DialogDescription>
              {scenarioPendingDeletion == null
                ? 'This action cannot be undone.'
                : `Delete ${scenarioPendingDeletion.name} (${scenarioPendingDeletion.id}) and remove its scenario-manager assignments. Mirrored call history stays untouched.`}
            </DialogDescription>
          </DialogHeader>
          {deleteScenarioMutation.isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {deleteScenarioMutation.error instanceof Error
                ? deleteScenarioMutation.error.message
                : 'Unable to delete the scenario.'}
            </div>
          ) : null}
          <DialogFooter>
            <Button disabled={deleteScenarioMutation.isPending} type="button" variant="outline" onClick={dismissDeleteDialog}>
              Cancel
            </Button>
            <Button
              disabled={scenarioPendingDeletion == null || deleteScenarioMutation.isPending}
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              {deleteScenarioMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete scenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AdminScenarioEditorPage(props: { scenarioId: string | null }) {
  const { data } = useAdminWorkspace()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [scenarioPendingDeletion, setScenarioPendingDeletion] = useState<SoftphoneTestScenarioRecord | null>(null)
  const isNewScenario = props.scenarioId == null
  const scenario = useMemo(
    () => (props.scenarioId == null ? null : data.scenarios.find((candidate) => candidate.id === props.scenarioId) ?? null),
    [data.scenarios, props.scenarioId],
  )
  const saveScenarioMutation = useMutation({
    mutationFn: async (input: ScenarioDraft) => saveAdminSoftphoneScenario({ data: input }),
    onSuccess: async (savedScenario) => {
      queryClient.setQueryData(adminSoftphoneDashboardQueryOptions.queryKey, (currentValue: AdminSoftphoneDashboardData | undefined) => {
        if (currentValue == null || currentValue.status !== 'authorized') {
          return currentValue
        }

        const existingScenarioIndex = currentValue.scenarios.findIndex((currentScenario) => currentScenario.id === savedScenario.id)
        const nextScenarios = existingScenarioIndex === -1
          ? [savedScenario, ...currentValue.scenarios]
          : currentValue.scenarios.map((currentScenario) => (
              currentScenario.id === savedScenario.id ? savedScenario : currentScenario
            ))

        return {
          ...currentValue,
          scenarios: nextScenarios,
        }
      })

      if (isNewScenario) {
        await navigate({
          params: { scenarioId: savedScenario.id },
          replace: true,
          to: '/admins/scenarios/$scenarioId',
        })
      }
    },
  })
  const deleteScenarioMutation = useMutation({
    mutationFn: async (scenarioId: string) => deleteAdminSoftphoneScenario({ data: { scenarioId } }),
    onSuccess: async ({ scenarioId }) => {
      queryClient.setQueryData(adminSoftphoneDashboardQueryOptions.queryKey, (currentValue: AdminSoftphoneDashboardData | undefined) => {
        if (currentValue == null || currentValue.status !== 'authorized') {
          return currentValue
        }

        return {
          ...currentValue,
          scenarios: currentValue.scenarios.filter((candidate) => candidate.id !== scenarioId),
          users: currentValue.users.map((user) => ({
            ...user,
            managedScenarioIds: user.managedScenarioIds.filter((managedScenarioId) => managedScenarioId !== scenarioId),
          })),
        }
      })
      setScenarioPendingDeletion(null)
      await navigate({ to: '/admins/scenarios' })
    },
  })

  if (!data.permissions.canViewScenarios) {
    return <ScenarioRestrictedCard />
  }

  if (!isNewScenario && scenario == null) {
    return (
      <AdminAccessCard
        icon={(
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ShieldAlert className="size-5" />
          </div>
        )}
        title="Scenario not found"
        description="This scenario does not exist or is not assigned to your account."
      >
        <Button asChild className="w-fit" variant="outline">
          <Link to="/admins/scenarios">Back to scenarios</Link>
        </Button>
      </AdminAccessCard>
    )
  }

  function dismissDeleteDialog() {
    setScenarioPendingDeletion(null)
    deleteScenarioMutation.reset()
  }

  function handleConfirmDelete() {
    if (scenarioPendingDeletion == null) {
      return
    }

    deleteScenarioMutation.mutate(scenarioPendingDeletion.id)
  }

  return (
    <div className="grid gap-6">
      <ScenarioEditorCard
        key={scenario?.id ?? 'new'}
        initialDraft={scenario == null ? createEmptyScenarioDraft() : createDraftFromScenario(scenario)}
        onCopyScenarioAccessKey={copyScenarioAccessKeyToClipboard}
        onCopyScenarioUrl={copyScenarioUrlToClipboard}
        onDeleteScenario={data.viewer.role === 'admin' && scenario != null ? () => {
          deleteScenarioMutation.reset()
          setScenarioPendingDeletion(scenario)
        } : undefined}
        onSaveScenario={(draft) => saveScenarioMutation.mutateAsync(draft)}
      />

      <Dialog open={scenarioPendingDeletion != null} onOpenChange={(open) => !open && dismissDeleteDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete scenario?</DialogTitle>
            <DialogDescription>
              {scenarioPendingDeletion == null
                ? 'This action cannot be undone.'
                : `Delete ${scenarioPendingDeletion.name} (${scenarioPendingDeletion.id}) and remove its scenario-manager assignments. Mirrored call history stays untouched.`}
            </DialogDescription>
          </DialogHeader>
          {deleteScenarioMutation.isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {deleteScenarioMutation.error instanceof Error
                ? deleteScenarioMutation.error.message
                : 'Unable to delete the scenario.'}
            </div>
          ) : null}
          <DialogFooter>
            <Button disabled={deleteScenarioMutation.isPending} type="button" variant="outline" onClick={dismissDeleteDialog}>
              Cancel
            </Button>
            <Button
              disabled={scenarioPendingDeletion == null || deleteScenarioMutation.isPending}
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              {deleteScenarioMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete scenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AdminUsersPage() {
  const { data } = useAdminWorkspace()
  const queryClient = useQueryClient()
  const initialRolesByUserId = useMemo(() => (
    Object.fromEntries(data.users.map((user) => [user.id, user.role ?? 'user']))
  ), [data.users])
  const initialAssignmentsByScenarioId = useMemo(() => {
    const nextRecord: Record<string, string[]> = {}

    for (const scenario of data.scenarios) {
      nextRecord[scenario.id] = data.users
        .filter((user) => user.managedScenarioIds.includes(scenario.id))
        .map((user) => user.id)
    }

    return nextRecord
  }, [data.scenarios, data.users])
  const [draftRolesByUserId, setDraftRolesByUserId] = useState<Record<string, AppUserRole>>(initialRolesByUserId)
  const [draftAssignmentsByScenarioId, setDraftAssignmentsByScenarioId] = useState<Record<string, string[]>>(initialAssignmentsByScenarioId)
  const updateRoleMutation = useMutation({
    mutationFn: async (input: { role: AppUserRole, userId: string }) => updateAdminSoftphoneUserRole({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSoftphoneDashboardQueryOptions.queryKey })
    },
  })
  const replaceManagersMutation = useMutation({
    mutationFn: async (input: { scenarioId: string, userIds: string[] }) => replaceAdminSoftphoneScenarioManagers({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSoftphoneDashboardQueryOptions.queryKey })
    },
  })

  useEffect(() => {
    setDraftRolesByUserId(initialRolesByUserId)
  }, [initialRolesByUserId])

  useEffect(() => {
    setDraftAssignmentsByScenarioId(initialAssignmentsByScenarioId)
  }, [initialAssignmentsByScenarioId])

  if (!data.permissions.canManageUsers) {
    return (
      <AdminAccessCard
        icon={(
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ShieldAlert className="size-5" />
          </div>
        )}
        title="User management is restricted"
        description="Only admins can change roles or scenario assignments."
      />
    )
  }

  return (
    <div className="grid gap-6">
      <AdminPanel>
        <AdminPanelHeader
          title="Roles"
          description="Set each user's role. Readers only get analytics for assigned scenarios."
        />
        <div className="grid p-3">
          {data.users.length === 0 ? (
            <AdminEmptyState
              title="No users have signed in yet."
              description="Role management becomes available after the first authenticated sign-in."
            />
          ) : (
            <div className="grid gap-2">
              {data.users.map((user) => {
                const selectedRole = draftRolesByUserId[user.id] ?? 'user'

                return (
                  <div className="flex flex-wrap items-center gap-4 rounded-md border px-4 py-3" key={user.id}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <Badge variant="outline">{roleLabels[user.role ?? 'user']}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedRole}
                        onValueChange={(value) => setDraftRolesByUserId((currentValue) => ({
                          ...currentValue,
                          [user.id]: value as AppUserRole,
                        }))}
                      >
                        <SelectTrigger className="h-8 w-32" id={`role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {roleLabels[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={updateRoleMutation.isPending || selectedRole === (user.role ?? 'user')}
                        onClick={() => updateRoleMutation.mutate({
                          role: selectedRole,
                          userId: user.id,
                        })}
                        size="sm"
                      >
                        {updateRoleMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelHeader
          title="Scenario assignments"
          description="Choose which users can operate or review each scenario."
        />
        <div className="grid">
          {data.scenarios.map((scenario, scenarioIndex) => {
            const selectedUserIds = new Set(draftAssignmentsByScenarioId[scenario.id] ?? [])

            return (
              <section className={cn('grid gap-4 px-5 py-5', scenarioIndex > 0 ? 'border-t' : '')} key={scenario.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{scenario.name}</h3>
                    <p className="font-mono text-xs text-muted-foreground">{scenario.id}</p>
                  </div>
                  <Badge variant="outline">{selectedUserIds.size} {selectedUserIds.size === 1 ? 'manager' : 'managers'}</Badge>
                </div>
                {data.users.length === 0 ? (
                  <AdminEmptyState
                    title="Nobody is available to assign."
                    description="No users have signed in yet."
                  />
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {data.users.map((user) => {
                      const isAssigned = selectedUserIds.has(user.id)

                      return (
                        <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-muted/40" key={user.id}>
                          <input
                            checked={isAssigned}
                            className="mt-0.5 size-4 accent-primary"
                            type="checkbox"
                            onChange={(event) => {
                              const nextSelectedUserIds = new Set(draftAssignmentsByScenarioId[scenario.id] ?? [])

                              if (event.target.checked) {
                                nextSelectedUserIds.add(user.id)
                              } else {
                                nextSelectedUserIds.delete(user.id)
                              }

                              setDraftAssignmentsByScenarioId((currentValue) => ({
                                ...currentValue,
                                [scenario.id]: Array.from(nextSelectedUserIds),
                              }))
                            }}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{user.email} · {roleLabels[user.role ?? 'user']}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    disabled={replaceManagersMutation.isPending}
                    size="sm"
                    onClick={() => replaceManagersMutation.mutate({
                      scenarioId: scenario.id,
                      userIds: draftAssignmentsByScenarioId[scenario.id] ?? [],
                    })}
                  >
                    {replaceManagersMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    Save assignments
                  </Button>
                </div>
              </section>
            )
          })}
        </div>
      </AdminPanel>
    </div>
  )
}

export function AdminDeveloperInformationPage() {
  const { data } = useAdminWorkspace()
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(data.scenarios[0]?.id ?? '')
  const effectiveSelectedScenarioId =
    data.scenarios.some((scenario) => scenario.id === selectedScenarioId)
      ? selectedScenarioId
      : data.scenarios[0]?.id ?? ''
  const selectedScenario = useMemo(
    () => data.scenarios.find((scenario) => scenario.id === effectiveSelectedScenarioId) ?? null,
    [data.scenarios, effectiveSelectedScenarioId],
  )

  if (data.scenarios.length === 0 || selectedScenario == null) {
    return (
      <AdminPanel>
        <AdminPanelHeader
          title="No accessible scenarios"
          description="This account does not currently have a scenario context to inspect."
        />
      </AdminPanel>
    )
  }

  return (
    <AdminPanel>
      <AdminPanelHeader
        title="Developer reference"
        description={<span>Access key <span className="font-mono text-xs">{selectedScenario.accessKey}</span> · {selectedScenario.config.profiles.length} profiles · {selectedScenario.config.phases.length} phases</span>}
        actions={(
          <Select value={effectiveSelectedScenarioId} onValueChange={setSelectedScenarioId}>
            <SelectTrigger className="h-8 min-w-[14rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.scenarios.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <SoftphoneInformationSurface
        contentHeightClassName="h-[min(70vh,52rem)]"
        context={createScenarioInformationContext(selectedScenario)}
        defaultTab="developer"
      />
    </AdminPanel>
  )
}

export function AdminAnalyticsPage() {
  const { data } = useAdminWorkspace()
  const queryClient = useQueryClient()
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('all')
  const [scenarioPendingHistoryDeletion, setScenarioPendingHistoryDeletion] = useState<{
    id: string
    name: string
  } | null>(null)
  const effectiveSelectedScenarioId =
    selectedScenarioId === 'all' || data.scenarios.some((scenario) => scenario.id === selectedScenarioId)
      ? selectedScenarioId
      : 'all'
  const deleteScenarioHistoryMutation = useMutation({
    mutationFn: async (input: { scenarioId: string }) => deleteAdminSoftphoneScenarioHistory({ data: input }),
    onSuccess: async () => {
      setScenarioPendingHistoryDeletion(null)
      await queryClient.invalidateQueries({ queryKey: adminSoftphoneDashboardQueryOptions.queryKey })
    },
  })
  const filteredHistory = useMemo(
    () => effectiveSelectedScenarioId === 'all'
      ? data.history
      : data.history.filter((entry) => entry.scenarioId === effectiveSelectedScenarioId),
    [data.history, effectiveSelectedScenarioId],
  )
  const scenarioHistoryCount = useMemo(() => {
    if (effectiveSelectedScenarioId === 'all') {
      return 0
    }

    return data.history.filter((entry) => entry.scenarioId === effectiveSelectedScenarioId).length
  }, [data.history, effectiveSelectedScenarioId])

  function dismissScenarioHistoryDeletionDialog() {
    if (deleteScenarioHistoryMutation.isPending) {
      return
    }

    setScenarioPendingHistoryDeletion(null)
  }

  function openScenarioHistoryDeletionDialog() {
    if (effectiveSelectedScenarioId === 'all') {
      return
    }

    const scenario = data.scenarios.find((entry) => entry.id === effectiveSelectedScenarioId)

    setScenarioPendingHistoryDeletion({
      id: effectiveSelectedScenarioId,
      name: scenario?.name ?? effectiveSelectedScenarioId,
    })
  }

  function handleConfirmScenarioHistoryDeletion() {
    if (scenarioPendingHistoryDeletion == null || deleteScenarioHistoryMutation.isPending) {
      return
    }

    deleteScenarioHistoryMutation.mutate({ scenarioId: scenarioPendingHistoryDeletion.id })
  }

  if (!data.permissions.canViewAnalytics) {
    return (
      <AdminAccessCard
        icon={(
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ShieldAlert className="size-5" />
          </div>
        )}
        title="Analytics access is not enabled"
        description="This account can reach the admin workspace, but it is not allowed to inspect persisted call analytics."
      />
    )
  }

  return (
    <div className="grid gap-6">
      <SoftphoneCallHistoryCard
        history={filteredHistory}
        hydrated
        mode="admin"
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <Select value={effectiveSelectedScenarioId} onValueChange={setSelectedScenarioId}>
              <SelectTrigger className="h-8 min-w-[13rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scenarios</SelectItem>
                {data.scenarios.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.viewer.role === 'admin' ? (
              <Button
                disabled={effectiveSelectedScenarioId === 'all' || scenarioHistoryCount === 0 || deleteScenarioHistoryMutation.isPending}
                size="sm"
                type="button"
                variant="outline"
                onClick={openScenarioHistoryDeletionDialog}
              >
                {deleteScenarioHistoryMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Delete history
              </Button>
            ) : null}
          </div>
        )}
      />

      <Dialog open={scenarioPendingHistoryDeletion != null} onOpenChange={(open) => !open && dismissScenarioHistoryDeletionDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete scenario analytics?</DialogTitle>
            <DialogDescription>
              {scenarioPendingHistoryDeletion == null
                ? 'This action cannot be undone.'
                : `Delete ${scenarioPendingHistoryDeletion.name} (${scenarioPendingHistoryDeletion.id}) analytics data: ${scenarioHistoryCount} persisted call record${scenarioHistoryCount === 1 ? '' : 's'} (including feedback).`}
            </DialogDescription>
          </DialogHeader>
          {deleteScenarioHistoryMutation.isError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {deleteScenarioHistoryMutation.error instanceof Error
                ? deleteScenarioHistoryMutation.error.message
                : 'Unable to delete the analytics data.'}
            </div>
          ) : null}
          <DialogFooter>
            <Button disabled={deleteScenarioHistoryMutation.isPending} type="button" variant="outline" onClick={dismissScenarioHistoryDeletionDialog}>
              Cancel
            </Button>
            <Button
              disabled={scenarioPendingHistoryDeletion == null || deleteScenarioHistoryMutation.isPending}
              type="button"
              variant="destructive"
              onClick={handleConfirmScenarioHistoryDeletion}
            >
              {deleteScenarioHistoryMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete analytics
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
