function normalizeUrl(value: string | undefined) {
  const normalizedValue = value?.trim()
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null
}

export function resolveAppUrl() {
  return normalizeUrl(process.env.BETTER_AUTH_URL)
    ?? normalizeUrl(process.env.APP_URL)
    ?? 'http://localhost:5173'
}

const DEV_ONLY_AUTH_SECRET = 'dev-only-secret-change-me'

export function resolveAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim()
  const hasStrongSecret = Boolean(secret) && secret !== DEV_ONLY_AUTH_SECRET

  if (hasStrongSecret) {
    return secret as string
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'BETTER_AUTH_SECRET must be set to a strong unique value in production (e.g. `openssl rand -base64 32`).',
    )
  }

  console.warn(
    '[auth] BETTER_AUTH_SECRET is missing or uses the well-known dev placeholder. '
    + 'Falling back to an insecure development-only secret; set BETTER_AUTH_SECRET before deploying.',
  )

  return DEV_ONLY_AUTH_SECRET
}

export function resolveAdminEmailAllowlist() {
  const rawValue = process.env.AUTH_ADMIN_EMAILS?.trim()

  if (!rawValue) {
    return []
  }

  return rawValue
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)
}
