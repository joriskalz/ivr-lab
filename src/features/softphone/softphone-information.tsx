import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SOFTPHONE_SHARED_SECRET_PLACEHOLDER,
  resolveAbsoluteSoftphoneExternalEndpointUrl,
  resolveSoftphoneExternalEndpointSampleYaml,
  type SoftphoneExternalEndpointSampleKind,
} from '@/features/softphone/external-endpoints'
import type {
  SoftphoneExternalEndpointBundle,
  SoftphoneProfile,
  SoftphoneScenarioFeatures,
} from '@/features/softphone/types'
import { cn } from '@/lib/utils'

export type SoftphoneInformationTab = 'developer' | 'user'

export type SoftphoneInformationContext = {
  accessKey?: string | null
  activeProfile?: SoftphoneProfile | null
  correlationCode?: string | null
  externalEndpointBundle?: SoftphoneExternalEndpointBundle | null
  features: SoftphoneScenarioFeatures
  scenarioId: string
  scenarioName: string
  softphoneUrl?: string | null
}

type DeveloperSample = {
  description: string
  kind: SoftphoneExternalEndpointSampleKind
  title: string
}

const developerSamples: DeveloperSample[] = [
  {
    description: 'Send debug text into the softphone debug area.',
    kind: 'debugInformationSet',
    title: 'Debug information',
  },
  {
    description: 'Push raw IVR text so the raw transcript panel updates.',
    kind: 'ivrRawTextSet',
    title: 'Raw IVR text',
  },
  {
    description: 'Mark the current IVR phase in the scenario timeline.',
    kind: 'phaseSet',
    title: 'Phase information',
  },
  {
    description: 'Send recognized fields through the generic event endpoint.',
    kind: 'eventSet',
    title: 'Recognized fields event',
  },
  {
    description: 'Write case data directly into the softphone case payload.',
    kind: 'caseSet',
    title: 'Case data',
  },
]

function resolveExternalEndpointBundle(context: SoftphoneInformationContext): SoftphoneExternalEndpointBundle {
  if (context.externalEndpointBundle != null) {
    return context.externalEndpointBundle
  }

  return {
    caseGetUrl: '/api/public/softphone/case/get',
    caseSetUrl: '/api/public/softphone/case/set',
    correlationHeaderName: 'x-softphone-correlation-code',
    correlationHeaderValue: context.correlationCode?.trim() || '{{softphone_correlation_code}}',
    debugInformationSetUrl: '/api/public/softphone/case/debug-information/set',
    eventSetUrl: '/api/public/softphone/case/event/set',
    headerName: 'x-softphone-shared-secret',
    headerValue: SOFTPHONE_SHARED_SECRET_PLACEHOLDER,
    ivrRawTextSetUrl: '/api/public/softphone/case/ivr-raw-text/set',
    ivrRecognizedSetUrl: '/api/public/softphone/case/ivr-recognized/set',
    phaseSetUrl: '/api/public/softphone/case/phase/set',
  }
}

function resolveOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://ivr-lab.demo-monkey.net'
}

function resolveSampleUrl(bundle: SoftphoneExternalEndpointBundle, kind: SoftphoneExternalEndpointSampleKind) {
  const origin = resolveOrigin()

  const pathByKind: Record<SoftphoneExternalEndpointSampleKind, string> = {
    caseGet: bundle.caseGetUrl,
    caseSet: bundle.caseSetUrl,
    debugInformationSet: bundle.debugInformationSetUrl,
    eventSet: bundle.eventSetUrl,
    ivrRawTextSet: bundle.ivrRawTextSetUrl,
    ivrRecognizedSet: bundle.ivrRecognizedSetUrl,
    phaseSet: bundle.phaseSetUrl,
  }

  return resolveAbsoluteSoftphoneExternalEndpointUrl(origin, pathByKind[kind])
}

function SectionCard(props: {
  children: ReactNode
  description?: string
  title: string
}) {
  return (
    <Card>
      <CardHeader className="gap-2 pb-4">
        <CardTitle className="text-base">{props.title}</CardTitle>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{props.children}</CardContent>
    </Card>
  )
}

function CodeBlock(props: {
  children: string
  languageLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-neutral-950 text-neutral-50">
      <div className="border-b border-white/10 px-3 py-1.5 font-mono text-xs text-neutral-400">
        {props.languageLabel}
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-xs leading-6">
        <code>{props.children}</code>
      </pre>
    </div>
  )
}

export function SoftphoneAboutContent() {
  return (
    <div className="grid gap-4 text-sm leading-7 text-muted-foreground">
      <section className="grid gap-2 border-b border-border pb-4">
        <h3 className="text-base font-medium text-foreground">How it works</h3>
        <p>
          This IVR test lab works directly with Copilot Studio. Each softphone session gets its own IVR code so Copilot Studio can send information to the correct session.
        </p>
        <p>
          During a test, Copilot Studio sends live updates, recognized content, phases, and debug information to this system. The softphone shows those updates in real time.
        </p>
      </section>

      <section className="grid gap-2 border-b border-border pb-4">
        <h3 className="text-base font-medium text-foreground">What you see here</h3>
        <p>
          In the softphone you can follow the current test flow, including IVR status, transmitted case data, raw dialog text, and debug information.
        </p>
        <p>
          This makes it easy to verify what Copilot Studio sends at each step and how that information arrives in the lab.
        </p>
      </section>

      <section className="grid gap-2 border-b border-border pb-4">
        <h3 className="text-base font-medium text-foreground">Contact</h3>
        <p>
          If you have questions about the lab or would like access, please contact Joris Kalz.
        </p>
        <p>
          LinkedIn:
          {' '}
          <a
            className="underline underline-offset-4"
            href="https://www.linkedin.com/in/joris-kalz/"
            rel="noreferrer"
            target="_blank"
          >
            joris-kalz
          </a>
        </p>
      </section>
    </div>
  )
}

function SoftphoneUserInformation() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-2 border-b border-border pb-6 last:border-b-0 last:pb-0">
        <div className="grid gap-1">
          <h3 className="text-base font-medium text-foreground">Browser requirements</h3>
          <p className="text-sm text-muted-foreground">
            The browser softphone depends on these runtime permissions and environment assumptions.
          </p>
        </div>
        <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li className="list-disc">Microphone access must be allowed by the browser before a call can connect cleanly.</li>
          <li className="list-disc">Keep the tab focused during testing when you want to use the keyboard shortcuts listed below.</li>
          <li className="list-disc">If the browser blocks microphone or audio permissions, allow them first and then retry the call.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <div className="grid gap-1">
          <h3 className="text-base font-medium text-foreground">Keyboard shortcuts</h3>
          <p className="text-sm text-muted-foreground">
            Shortcuts work inside the softphone call UI when the focus is not inside an input field.
          </p>
        </div>
        <dl className="grid gap-3 text-sm leading-6 sm:grid-cols-[minmax(9rem,12rem)_1fr]">
          <dt className="font-mono text-foreground">Enter</dt>
          <dd className="text-muted-foreground">Start the call or end the active call.</dd>
          <dt className="font-mono text-foreground">Space</dt>
          <dd className="text-muted-foreground">Mute or unmute while a call is active.</dd>
          <dt className="font-mono text-foreground">0-9, *, #</dt>
          <dd className="text-muted-foreground">Send DTMF tones after the ACS call reaches the connected state.</dd>
          <dt className="font-mono text-foreground">Toolbar actions</dt>
          <dd className="text-muted-foreground">Use Help for operator guidance, About for lab context, and Switch session to clear the current unlock.</dd>
        </dl>
      </section>
    </div>
  )
}

function SoftphoneDeveloperInformation(props: {
  context: SoftphoneInformationContext
}) {
  const bundle = resolveExternalEndpointBundle(props.context)

  return (
    <div className="grid gap-6">
      <SectionCard
        title="Required headers"
        description="Every sample uses the same two headers plus JSON content type."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <p className="font-mono text-xs text-muted-foreground">{bundle.correlationHeaderName}</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{bundle.correlationHeaderValue}</p>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <p className="font-mono text-xs text-muted-foreground">{bundle.headerName}</p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{bundle.headerValue}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Sample calls"
        description="Minimal Copilot Studio YAML samples for each softphone endpoint."
      >
        <div className="grid gap-5">
          {developerSamples.map((sample) => (
            <div className="grid gap-3" key={sample.title}>
              <div className="grid gap-0.5">
                <h4 className="text-sm font-semibold text-foreground">{sample.title}</h4>
                <p className="text-sm text-muted-foreground">{sample.description}</p>
              </div>
              <CodeBlock languageLabel="yaml">
                {resolveSoftphoneExternalEndpointSampleYaml({
                  correlationHeaderName: bundle.correlationHeaderName,
                  correlationHeaderValue: bundle.correlationHeaderValue,
                  headerName: bundle.headerName,
                  headerValue: bundle.headerValue,
                  kind: sample.kind,
                  url: resolveSampleUrl(bundle, sample.kind),
                })}
              </CodeBlock>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

export function SoftphoneInformationSurface(props: {
  className?: string
  contentHeightClassName?: string
  context: SoftphoneInformationContext
  defaultTab?: SoftphoneInformationTab
  showDeveloperTab?: boolean
}) {
  const contentHeightClassName = props.contentHeightClassName ?? 'h-[min(62vh,38rem)]'
  const showDeveloperTab = props.showDeveloperTab ?? true

  if (!showDeveloperTab) {
    return (
      <div className={cn('min-h-0', props.className)}>
        <div className="border-b px-5 py-4 sm:px-6">
          <div className="grid gap-0.5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{props.context.scenarioName}</h3>
            <p className="text-sm text-muted-foreground">
              Operator guidance for scenario <span className="font-mono text-xs">{props.context.scenarioId}</span>.
            </p>
          </div>
        </div>
        <ScrollArea className={contentHeightClassName}>
          <div className="grid gap-6 px-5 py-5 sm:px-6">
            <SoftphoneUserInformation />
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <Tabs
      className={cn('min-h-0 gap-0', props.className)}
      defaultValue={props.defaultTab ?? 'user'}
    >
      <div className="border-b px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-0.5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{props.context.scenarioName}</h3>
            <p className="text-sm text-muted-foreground">
              Scenario <span className="font-mono text-xs">{props.context.scenarioId}</span>
            </p>
          </div>
          <TabsList>
            <TabsTrigger value="user">User guide</TabsTrigger>
            <TabsTrigger value="developer">Developer</TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="user" className="mt-0 min-h-0">
        <ScrollArea className={contentHeightClassName}>
          <div className="grid gap-6 px-5 py-5 sm:px-6">
            <SoftphoneUserInformation />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="developer" className="mt-0 min-h-0">
        <ScrollArea className={contentHeightClassName}>
          <div className="grid gap-6 px-5 py-5 sm:px-6">
            <SoftphoneDeveloperInformation context={props.context} />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
