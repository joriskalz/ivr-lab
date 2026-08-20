import type { CSSProperties } from 'react'

export const DEFAULT_SOFTPHONE_BRAND_COLOR = '#4e733c'
const WHITE_HEX = '#ffffff'

function expandHexColor(value: string) {
  if (!/^#[0-9a-f]{3}$/i.test(value)) {
    return value
  }

  const [, r, g, b] = value
  return `#${r}${r}${g}${g}${b}${b}`
}

function parseHexColor(value: string) {
  const normalizedValue = expandHexColor(normalizeSoftphoneBrandColor(value))
  const match = normalizedValue.match(/^#([0-9a-f]{6})$/i)

  if (match == null) {
    return {
      blue: 60,
      green: 115,
      red: 78,
    }
  }

  return {
    blue: Number.parseInt(match[1].slice(4, 6), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    red: Number.parseInt(match[1].slice(0, 2), 16),
  }
}

export function normalizeSoftphoneBrandColor(value: unknown, fallback = DEFAULT_SOFTPHONE_BRAND_COLOR) {
  const candidate = typeof value === 'string' ? value.trim() : ''

  if (!candidate) {
    return fallback
  }

  const normalizedValue = candidate.startsWith('#') ? candidate : `#${candidate}`
  const expandedValue = expandHexColor(normalizedValue)

  return /^#[0-9a-f]{6}$/i.test(expandedValue)
    ? expandedValue.toLowerCase()
    : fallback
}

export function withAlpha(color: string, alpha: number) {
  const { blue, green, red } = parseHexColor(color)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function buildSoftphoneBrandVariables(brandColor: string): CSSProperties {
  const normalizedColor = normalizeSoftphoneBrandColor(brandColor)

  return {
    '--chart-1': normalizedColor,
    '--primary': normalizedColor,
    '--primary-foreground': WHITE_HEX,
    '--ring': normalizedColor,
    '--sidebar-primary': normalizedColor,
    '--sidebar-primary-foreground': WHITE_HEX,
    '--softphone-brand': normalizedColor,
    '--softphone-brand-border': withAlpha(normalizedColor, 0.26),
    '--softphone-brand-foreground': WHITE_HEX,
    '--softphone-brand-muted': withAlpha(normalizedColor, 0.14),
    '--softphone-brand-panel': withAlpha(normalizedColor, 0.18),
  } as CSSProperties
}
