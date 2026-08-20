const UINT32_RANGE = 0x1_0000_0000

function getRandomUint32() {
  const buffer = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buffer)
  return buffer[0] as number
}

export function secureRandomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new Error('maxExclusive must be an integer between 1 and 2^32.')
  }

  // Rejection sampling keeps the distribution uniform.
  const usableRange = UINT32_RANGE - (UINT32_RANGE % maxExclusive)

  for (;;) {
    const candidate = getRandomUint32()

    if (candidate < usableRange) {
      return candidate % maxExclusive
    }
  }
}

export function secureRandomDigits(length: number) {
  return Array.from({ length }, () => String(secureRandomInt(10))).join('')
}

export function secureRandomUppercaseLetters(length: number) {
  return Array.from({ length }, () => String.fromCharCode(65 + secureRandomInt(26))).join('')
}
