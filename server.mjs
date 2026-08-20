import { resolve, sep } from 'node:path'
import app from './dist/server/server.js'

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || 3000)
const clientRoot = resolve(import.meta.dirname, 'dist/client')
const isProduction = process.env.NODE_ENV === 'production'
// Allows deployments that intentionally embed the softphone to widen this,
// e.g. FRAME_ANCESTORS="'self' https://copilotstudio.example".
const frameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'self'"

// Bun's default idleTimeout of 10s closes quiet connections before the SSE
// keepalive (15s) ever fires; keep the keepalive well inside the timeout.
const idleTimeoutSeconds = 60

// Hashed files under /assets/ never change once emitted; anything else served
// from dist/client (e.g. favicon) may change between deploys.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const STATIC_CACHE_CONTROL = 'public, max-age=3600'

// Extensions the build precompresses (scripts/compress-assets.ts) and that
// caches must vary on accept-encoding for.
const COMPRESSIBLE_EXTENSIONS = ['.js', '.css', '.svg', '.json', '.txt', '.html']

function setSecurityHeaders(headers) {
  headers.set('x-content-type-options', 'nosniff')
  headers.set('content-security-policy', `frame-ancestors ${frameAncestors}`)
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(self)')
  headers.set('cross-origin-opener-policy', 'same-origin')

  if (frameAncestors === "'self'") {
    headers.set('x-frame-options', 'SAMEORIGIN')
  }

  if (isProduction) {
    headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains')
  }
}

function finalizeHeaders(headers) {
  setSecurityHeaders(headers)

  // Documents and API responses must never be reused after a redeploy; routes
  // that need something else (SSE, static assets) set their own value.
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'no-cache')
  }
}

function applySecurityHeaders(response) {
  try {
    finalizeHeaders(response.headers)
    return response
  } catch {
    // Responses with immutable headers (e.g. proxied fetch results) get cloned.
    const headers = new Headers(response.headers)
    finalizeHeaders(headers)

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  }
}

function resolveStaticFilePath(pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname
  const requestedPath = resolve(clientRoot, `.${normalizedPath}`)

  if (requestedPath !== clientRoot && !requestedPath.startsWith(`${clientRoot}${sep}`)) {
    return null
  }

  return requestedPath
}

function isCompressiblePath(filePath) {
  return COMPRESSIBLE_EXTENSIONS.some((extension) => filePath.endsWith(extension))
}

function acceptsEncoding(request, encoding) {
  const acceptEncoding = request.headers.get('accept-encoding') ?? ''

  return acceptEncoding
    .split(',')
    .some((part) => part.split(';')[0].trim().toLowerCase() === encoding)
}

async function resolvePrecompressedFile(request, filePath) {
  if (!isCompressiblePath(filePath)) {
    return null
  }

  for (const { encoding, suffix } of [
    { encoding: 'br', suffix: '.br' },
    { encoding: 'gzip', suffix: '.gz' },
  ]) {
    if (!acceptsEncoding(request, encoding)) {
      continue
    }

    const candidate = Bun.file(`${filePath}${suffix}`)

    if (await candidate.exists()) {
      return { encoding, file: candidate }
    }
  }

  return null
}

async function tryServeStaticAsset(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null
  }

  const url = new URL(request.url)
  const filePath = resolveStaticFilePath(url.pathname)

  if (filePath == null) {
    return null
  }

  const isHashedAsset = url.pathname.startsWith('/assets/')
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    // A missing hashed asset means the client holds HTML from a previous
    // deploy. Answer with a plain 404 instead of falling through to the SSR
    // not-found page, so module/stylesheet loads fail cleanly and the
    // vite:preloadError handler can reload into the new build.
    if (isHashedAsset) {
      return new Response('Not found', {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        },
        status: 404,
      })
    }

    return null
  }

  const headers = new Headers({
    'cache-control': isHashedAsset ? IMMUTABLE_CACHE_CONTROL : STATIC_CACHE_CONTROL,
    'content-type': file.type || 'application/octet-stream',
  })

  if (isCompressiblePath(filePath)) {
    headers.set('vary', 'accept-encoding')
  }

  const precompressed = await resolvePrecompressedFile(request, filePath)
  const responseFile = precompressed?.file ?? file

  if (precompressed != null) {
    headers.set('content-encoding', precompressed.encoding)
  }

  if (request.method === 'HEAD') {
    headers.set('content-length', String(responseFile.size))
    return new Response(null, { headers })
  }

  return new Response(responseFile, { headers })
}

const server = Bun.serve({
  hostname: host,
  idleTimeout: idleTimeoutSeconds,
  port,
  async fetch(request) {
    const staticResponse = await tryServeStaticAsset(request)

    if (staticResponse != null) {
      return applySecurityHeaders(staticResponse)
    }

    try {
      return applySecurityHeaders(await app.fetch(request))
    } catch (error) {
      console.error('[server] request handler failed', error)

      return applySecurityHeaders(
        new Response('Internal server error', {
          headers: {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
          },
          status: 500,
        }),
      )
    }
  },
})

// As PID 1 in a container the kernel applies no default signal actions, so
// SIGTERM must be handled explicitly or every stop escalates to SIGKILL.
// Active connections are closed too: open SSE streams would otherwise hold
// the process past the orchestrator's grace period.
function shutdown(signal) {
  console.log(`[server] received ${signal}, shutting down`)
  server.stop(true)
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
