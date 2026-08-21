import {
  BarChart3,
  Check,
  ChevronRight,
  Code2,
  Eye,
  EyeOff,
  FlaskConical,
  LoaderCircle,
  LogOut,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { adminSoftphoneDashboardQueryOptions } from '@/features/admin-softphone/dashboard-query'
import { useAdminHeaderStore } from '@/features/admin-softphone/header-store'
import { getViewerRouteAccess } from '@/features/auth/access'
import { authClient } from '@/features/auth/client'
import { cn } from '@/lib/utils'

type RouteTitle = {
  subtitle: string
  title: string
}

type NavigationItem = {
  description: string
  icon: LucideIcon
  label: string
  to: string
}

const routeTitles: Record<string, RouteTitle> = {
  '/admins/scenarios': {
    title: 'Scenarios',
    subtitle: 'Create and edit shared softphone test scenarios.',
  },
  '/admins/users': {
    title: 'Users',
    subtitle: 'Manage roles and scenario assignments.',
  },
  '/admins/analytics': {
    title: 'Analytics',
    subtitle: 'Review persisted call history by scenario.',
  },
  '/admins/developer-information': {
    title: 'Developer reference',
    subtitle: 'Integration endpoints and Copilot Studio samples per scenario.',
  },
}

const adminNavigationItems = [
  { description: 'Build and maintain softphone scenarios.', icon: Settings2, label: 'Scenarios', to: '/admins/scenarios' },
  { description: 'Assign roles and scenario access.', icon: Users, label: 'Users', to: '/admins/users' },
  { description: 'Review persisted call analytics.', icon: BarChart3, label: 'Analytics', to: '/admins/analytics' },
  { description: 'Integration samples and endpoints.', icon: Code2, label: 'Developer reference', to: '/admins/developer-information' },
] as const satisfies readonly NavigationItem[]

function resolveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return '?'
  }

  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return `${first}${last}`.toUpperCase() || '?'
}

export function AppShell(props: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isAdminRoute = pathname === '/admins' || pathname.startsWith('/admins/')
  const isSignedInRoute = pathname === '/' || isAdminRoute
  const viewerAccessQuery = useQuery({
    enabled: isSignedInRoute,
    queryFn: () => getViewerRouteAccess(),
    queryKey: ['viewer-route-access'],
  })
  const isAuthenticated = viewerAccessQuery.data?.isAuthenticated === true
  const hasAdminAccess = viewerAccessQuery.data?.hasAdminAccess === true
  const showSignedInShell = isAuthenticated && !pathname.startsWith('/softphone')
  const adminHeaderAutosave = useAdminHeaderStore((state) => state.autosave)
  const sensitiveInformationVisible = useAdminHeaderStore((state) => state.sensitiveInformationVisible)
  const toggleSensitiveInformation = useAdminHeaderStore((state) => state.toggleSensitiveInformation)
  const adminDashboardQuery = useQuery({
    ...adminSoftphoneDashboardQueryOptions,
    enabled: isAdminRoute && hasAdminAccess,
  })
  const viewer = adminDashboardQuery.data?.status === 'authorized' ? adminDashboardQuery.data.viewer : null

  const currentTitle = pathname === '/admins'
    ? routeTitles['/admins/scenarios']
    : routeTitles[pathname] ?? routeTitles['/admins/scenarios']
  const scenarioDetailSegment = pathname.match(/^\/admins\/scenarios\/([^/]+)\/?$/)?.[1] ?? null
  const detailScenario = scenarioDetailSegment != null && scenarioDetailSegment !== 'new' && adminDashboardQuery.data?.status === 'authorized'
    ? adminDashboardQuery.data.scenarios.find((scenario) => scenario.id === scenarioDetailSegment) ?? null
    : null
  const scenarioDetailTitle = scenarioDetailSegment === 'new'
    ? 'New scenario'
    : detailScenario?.name ?? scenarioDetailSegment

  async function handleSignOut() {
    await authClient.signOut()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['viewer-route-access'] }),
      queryClient.invalidateQueries({ queryKey: adminSoftphoneDashboardQueryOptions.queryKey }),
    ])
  }

  if (!showSignedInShell) {
    return props.children
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-3 pt-3">
          <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FlaskConical className="size-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">IVR Test Lab</p>
              <p className="truncate text-xs text-sidebar-foreground/60">Contoso softphone</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-1.5">
          {hasAdminAccess ? (
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNavigationItems.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.to || pathname.startsWith(`${item.to}/`)}
                        tooltip={item.description}
                      >
                        <Link to={item.to}>
                          <item.icon className="size-4" strokeWidth={1.9} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:hidden">
          {viewer ? (
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {resolveInitials(viewer.name)}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{viewer.name}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">{viewer.email}</p>
              </div>
              <Button
                aria-label="Sign out"
                size="icon-sm"
                title="Sign out"
                type="button"
                variant="ghost"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-sidebar-foreground/60">Signed in</span>
              <Button size="sm" type="button" variant="ghost" onClick={() => void handleSignOut()}>
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </div>
          )}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-[100dvh] overflow-hidden">
        <div className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 md:px-6">
            <SidebarTrigger />
            <Separator className="h-5" orientation="vertical" />
            {scenarioDetailSegment != null ? (
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Link
                    className="shrink-0 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
                    to="/admins/scenarios"
                  >
                    Scenarios
                  </Link>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                  <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                    {scenarioDetailTitle}
                  </h1>
                </div>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {scenarioDetailSegment === 'new'
                    ? 'Draft — saves automatically once named.'
                    : <span className="font-mono">{scenarioDetailSegment}</span>}
                </p>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                  {currentTitle.title}
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {currentTitle.subtitle}
                </p>
              </div>
            )}
            {scenarioDetailSegment != null && adminHeaderAutosave.label ? (
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                {adminHeaderAutosave.isSaving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {!adminHeaderAutosave.isSaving && adminHeaderAutosave.tone === 'success' ? <Check className="size-3.5 text-primary" /> : null}
                <span
                  className={cn(
                    adminHeaderAutosave.tone === 'error' && 'text-destructive',
                    adminHeaderAutosave.tone === 'success' && 'text-primary',
                  )}
                >
                  {adminHeaderAutosave.label}
                </span>
              </div>
            ) : null}
            {isAdminRoute ? (
              <Button
                aria-label={sensitiveInformationVisible ? 'Hide sensitive information' : 'Show sensitive information'}
                aria-pressed={sensitiveInformationVisible}
                size="icon-sm"
                title={sensitiveInformationVisible ? 'Hide sensitive information' : 'Show sensitive information'}
                type="button"
                variant="ghost"
                onClick={toggleSensitiveInformation}
              >
                {sensitiveInformationVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            ) : null}
          </header>

          <main className="relative flex min-h-0 flex-1">
            <ScrollArea className="h-full flex-1">
              <div className="mx-auto w-full max-w-[90rem] px-4 py-6 md:px-6">
                {props.children}
              </div>
            </ScrollArea>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
