import '@tanstack/react-start/server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDb } from '@/db'
import { account, session, user, verification } from '@/db/schema'
import { resolveAppUrl, resolveAuthSecret } from '@/features/auth/env'
import { DEFAULT_APP_USER_ROLE } from '@/features/auth/roles'

export type AuthProvider = 'github' | 'google'

function resolveProviderCredentials(prefix: 'GITHUB' | 'GOOGLE') {
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim()
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim()

  if (!clientId || !clientSecret) {
    return null
  }

  return {
    clientId,
    clientSecret,
  }
}

export function getEnabledAuthProviders(): AuthProvider[] {
  const providers: AuthProvider[] = []

  if (resolveProviderCredentials('GOOGLE')) {
    providers.push('google')
  }

  if (resolveProviderCredentials('GITHUB')) {
    providers.push('github')
  }

  return providers
}

export const auth = betterAuth({
  baseURL: resolveAppUrl(),
  database: drizzleAdapter(getDb(), {
    provider: 'sqlite',
    schema: {
      account,
      session,
      user,
      verification,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        async before(nextUser) {
          return {
            data: {
              ...nextUser,
              role: DEFAULT_APP_USER_ROLE,
            },
          }
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
  secret: resolveAuthSecret(),
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  socialProviders: {
    ...(resolveProviderCredentials('GITHUB') ? { github: resolveProviderCredentials('GITHUB')! } : {}),
    ...(resolveProviderCredentials('GOOGLE') ? { google: resolveProviderCredentials('GOOGLE')! } : {}),
  },
  trustedOrigins: [resolveAppUrl()],
  user: {
    additionalFields: {
      role: {
        defaultValue: DEFAULT_APP_USER_ROLE,
        input: false,
        required: false,
        type: 'string',
      },
    },
  },
})
