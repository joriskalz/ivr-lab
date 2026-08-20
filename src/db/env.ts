import { isAbsolute, resolve } from 'node:path'

export function resolveDbFileName() {
  const configuredFileName = process.env.DB_FILE_NAME?.trim()

  if (!configuredFileName) {
    return resolve(process.cwd(), '.data/app.db')
  }

  return isAbsolute(configuredFileName)
    ? configuredFileName
    : resolve(process.cwd(), configuredFileName)
}
