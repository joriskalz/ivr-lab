import { describe, expect, test } from 'bun:test'
import { parseSoftphoneServerConfig } from '@/features/softphone/server/config'

const baseEnv = {
  SOFTPHONE_EXTERNAL_WRITE_SECRET: 'shared-secret',
}

describe('softphone config parsing', () => {
  test('parses env-backed external secret config', () => {
    const config = parseSoftphoneServerConfig(baseEnv)

    expect(config.externalWriteSecret).toBe(baseEnv.SOFTPHONE_EXTERNAL_WRITE_SECRET)
  })

  test('rejects missing external write secret', () => {
    expect(() =>
      parseSoftphoneServerConfig({
        ...baseEnv,
        SOFTPHONE_EXTERNAL_WRITE_SECRET: '',
      }),
    ).toThrow('SOFTPHONE_EXTERNAL_WRITE_SECRET is required.')
  })
})
