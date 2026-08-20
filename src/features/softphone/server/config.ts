export const SOFTPHONE_EXTERNAL_WRITE_HEADER = 'x-softphone-shared-secret'

export interface SoftphoneServerConfig {
  externalWriteSecret: string
}

let cachedConfig: SoftphoneServerConfig | null = null

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseSoftphoneServerConfig(env: Record<string, string | undefined>): SoftphoneServerConfig {
  const externalWriteSecret = normalizeString(env.SOFTPHONE_EXTERNAL_WRITE_SECRET)

  if (!externalWriteSecret) {
    throw new Error('SOFTPHONE_EXTERNAL_WRITE_SECRET is required.')
  }

  return {
    externalWriteSecret,
  }
}

export function getSoftphoneServerConfig() {
  if (cachedConfig == null) {
    cachedConfig = parseSoftphoneServerConfig(process.env)
  }

  return cachedConfig
}

export function __resetSoftphoneServerConfigForTests() {
  cachedConfig = null
}
