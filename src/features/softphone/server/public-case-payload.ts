import type { SoftphoneCaseDataPayload, SoftphoneScenarioValue } from '@/features/softphone/types'

export type SoftphonePublicCasePayload = SoftphoneCaseDataPayload & {
  aktenzeichen: string
  case_status: string
  debtor: {
    adresse: {
      hausnummer: string
      ort: string
      plz: string
      strasse: string
    }
    geburtsdatum: string
    nachname: string
    vorname: string
  }
}

function stringifyCaseValue(value: SoftphoneScenarioValue) {
  if (value == null) {
    return ''
  }

  return String(value)
}

export function buildSoftphonePublicCasePayload(caseData: SoftphoneCaseDataPayload | null): SoftphonePublicCasePayload | null {
  if (caseData == null) {
    return null
  }

  const values = caseData.values

  return {
    aktenzeichen: stringifyCaseValue(values.aktenzeichen ?? null),
    case_status: stringifyCaseValue(values.case_status ?? null),
    debtor: {
      adresse: {
        hausnummer: stringifyCaseValue(values.hausnummer ?? null),
        ort: stringifyCaseValue(values.ort ?? null),
        plz: stringifyCaseValue(values.plz ?? null),
        strasse: stringifyCaseValue(values.strasse ?? null),
      },
      geburtsdatum: stringifyCaseValue(values.geburtsdatum ?? null),
      nachname: stringifyCaseValue(values.nachname ?? null),
      vorname: stringifyCaseValue(values.vorname ?? null),
    },
    values: { ...values },
  }
}
