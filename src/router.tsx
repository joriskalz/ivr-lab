import { createRouter } from '@tanstack/react-router'
import { RouteErrorFallback } from '@/components/route-error'
import { routeTree } from './routeTree.gen'

const CHUNK_RELOAD_TIMESTAMP_KEY = 'contoso-ivr-lab:chunk-reload-at'

// After a redeploy, HTML from the previous build references hashed chunks
// that no longer exist; Vite surfaces those failures as vite:preloadError.
// Reload once to pick up the new build instead of leaving a dead page. The
// timestamp guard keeps a genuinely broken deploy from reload-looping.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_TIMESTAMP_KEY) ?? '0')

    if (Date.now() - lastReloadAt < 10_000) {
      return
    }

    event.preventDefault()
    window.sessionStorage.setItem(CHUNK_RELOAD_TIMESTAMP_KEY, String(Date.now()))
    window.location.reload()
  })
}

export function getRouter() {
  // A fresh router per call keeps concurrent SSR requests isolated from each
  // other; the browser calls this once at hydration.
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingMinMs: 120,
    defaultErrorComponent: RouteErrorFallback,
    defaultNotFoundComponent: () => (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        The requested IVR lab route does not exist.
      </div>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
