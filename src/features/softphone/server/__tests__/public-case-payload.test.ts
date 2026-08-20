import { describe, expect, test } from 'bun:test'
import { buildSoftphonePublicCasePayload } from '@/features/softphone/server/public-case-payload'

describe('buildSoftphonePublicCasePayload', () => {
  test('returns the legacy nested case shape alongside flat values', () => {
    const result = buildSoftphonePublicCasePayload({
      values: {
        aktenzeichen: 'M878245053085',
        case_status: 'active',
        geburtsdatum: '29.09.1976',
        hausnummer: '149',
        nachname: 'Haddad',
        ort: 'Leipzig',
        plz: '04109',
        strasse: 'Bruehl',
        vorname: 'Karim',
      },
    })

    expect(result).toEqual({
      aktenzeichen: 'M878245053085',
      case_status: 'active',
      debtor: {
        adresse: {
          hausnummer: '149',
          ort: 'Leipzig',
          plz: '04109',
          strasse: 'Bruehl',
        },
        geburtsdatum: '29.09.1976',
        nachname: 'Haddad',
        vorname: 'Karim',
      },
      values: {
        aktenzeichen: 'M878245053085',
        case_status: 'active',
        geburtsdatum: '29.09.1976',
        hausnummer: '149',
        nachname: 'Haddad',
        ort: 'Leipzig',
        plz: '04109',
        strasse: 'Bruehl',
        vorname: 'Karim',
      },
    })
  })

  test('returns null when there is no case data yet', () => {
    expect(buildSoftphonePublicCasePayload(null)).toBeNull()
  })
})
