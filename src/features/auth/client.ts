import { createAuthClient } from 'better-auth/react'

function resolveClientAuthBaseUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  const configuredUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.APP_URL?.trim()

  if (configuredUrl) {
    return configuredUrl
  }

  return 'http://localhost:5173'
}

export const authClient = createAuthClient({
  basePath: '/api/auth',
  baseURL: resolveClientAuthBaseUrl(),
})
