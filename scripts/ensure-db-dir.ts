import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

function resolveDbFileName() {
  const configuredFileName = process.env.DB_FILE_NAME?.trim()

  if (!configuredFileName) {
    return resolve(process.cwd(), '.data/app.db')
  }

  return isAbsolute(configuredFileName)
    ? configuredFileName
    : resolve(process.cwd(), configuredFileName)
}

mkdirSync(dirname(resolveDbFileName()), { recursive: true })
