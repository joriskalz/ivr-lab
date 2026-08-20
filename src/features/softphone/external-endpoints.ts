import type { SoftphoneExternalEndpointBundle } from '@/features/softphone/types'

export const SOFTPHONE_SHARED_SECRET_PLACEHOLDER = '{{softphone_shared_secret}}'

export type SoftphoneExternalEndpointSampleKind =
  | 'caseGet'
  | 'caseSet'
  | 'debugInformationSet'
  | 'eventSet'
  | 'phaseSet'
  | 'ivrRawTextSet'
  | 'ivrRecognizedSet'

export function resolveAbsoluteSoftphoneExternalEndpointUrl(origin: string, path: string) {
  const normalizedOrigin = origin.trim()

  if (!normalizedOrigin) {
    return path
  }

  return new URL(path, normalizedOrigin).toString()
}

export function resolveSoftphoneExternalEndpointCopyPayload(bundle: SoftphoneExternalEndpointBundle, origin: string) {
  return JSON.stringify(
    {
      endpoints: {
        caseGet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.caseGetUrl),
        caseSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.caseSetUrl),
        debugInformationSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.debugInformationSetUrl),
        eventSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.eventSetUrl),
        phaseSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.phaseSetUrl),
        ivrRawTextSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.ivrRawTextSetUrl),
        ivrRecognizedSet: resolveAbsoluteSoftphoneExternalEndpointUrl(origin, bundle.ivrRecognizedSetUrl),
      },
      headers: {
        'Content-Type': 'application/json',
        [bundle.correlationHeaderName]: bundle.correlationHeaderValue,
        [bundle.headerName]: bundle.headerValue,
      },
    },
    null,
    2,
  )
}

function resolveSoftphoneExternalEndpointSampleBody(kind: SoftphoneExternalEndpointSampleKind) {
  if (kind === 'caseGet') {
    return ''
  }

  if (kind === 'caseSet') {
    return [
      '      body:',
      '        kind: JsonRequestContent',
      '        content: |-',
      '          ={',
      '            values: {',
      '              aktenzeichen: "D432143219999",',
      '              case_status: "active",',
      '              geburtsdatum: "12.08.1964",',
      '              hausnummer: "83",',
      '              nachname: "Mustermann",',
      '              ort: "Berlin",',
      '              plz: "10115",',
      '              strasse: "Heidestrasse",',
      '              vorname: "Erika"',
      '            }',
      '          }',
    ].join('\n')
  }

  if (kind === 'eventSet') {
    return [
      '      body:',
      '        kind: JsonRequestContent',
      '        content: |-',
      '          ={',
      '            type: "recognized_fields",',
      '            timestamp: Text(Now(), "yyyy-MM-ddTHH:mm:ss"),',
      '            data: {',
      '              metadata: {',
      '                plz: {',
      '                  isMatch: true,',
      '                  score: 100',
      '                },',
      '                ort: {',
      '                  confidence: "high"',
      '                }',
      '              },',
      '              values: {',
      '                plz: Topic.postalCode,',
      '                ort: Topic.city',
      '              }',
      '            }',
      '          }',
    ].join('\n')
  }

  if (kind === 'debugInformationSet') {
    return [
      '      body:',
      '        kind: JsonRequestContent',
      '        content: |-',
      '          ={',
      '            debugInformation: {',
      '              message: Topic.message,',
      '              topicName: "MainTopic",',
      '              turnCount: 1',
      '            }',
      '          }',
    ].join('\n')
  }

  if (kind === 'ivrRecognizedSet') {
    return [
      '      body:',
      '        kind: JsonRequestContent',
      '        content: |-',
      '          ={',
      '            values: {',
      '              aktenzeichen: Topic.caseReference,',
      '              geburtsdatum: Topic.birthDate,',
      '              hausnummer: Topic.houseNumber,',
      '              nachname: Topic.lastName,',
      '              ort: Topic.city,',
      '              plz: Topic.postalCode,',
      '              strasse: Topic.street,',
      '              vorname: Topic.firstName',
      '            }',
      '          }',
    ].join('\n')
  }

  if (kind === 'phaseSet') {
    return [
      '      body:',
      '        kind: JsonRequestContent',
      '        content: |-',
      '          ={',
      '            phaseId: "case_id_collection",',
      '            timestamp: Text(Now(), "yyyy-MM-ddTHH:mm:ss"),',
      '            metadata: {',
      '              confidence: "high",',
      '              score: 98',
      '            }',
      '          }',
    ].join('\n')
  }

  return [
    '      body:',
    '        kind: JsonRequestContent',
    '        content: |-',
    '          ={',
    '            text: Topic.message',
    '          }',
  ].join('\n')
}

export function resolveSoftphoneExternalEndpointSampleYaml(input: {
  correlationHeaderName: string
  correlationHeaderValue: string
  headerName: string
  headerValue: string
  kind: SoftphoneExternalEndpointSampleKind
  url: string
}) {
  const method = input.kind === 'caseGet' ? 'Get' : 'Post'

  return [
    '    - kind: HttpRequestAction',
    '      id: webhookRequest',
    `      method: ${method}`,
    `      url: ="${input.url}"`,
    '      headers:',
    '        Content-Type: application/json',
    `        ${input.correlationHeaderName}: ="${input.correlationHeaderValue}"`,
    `        ${input.headerName}: ="${input.headerValue}"`,
    resolveSoftphoneExternalEndpointSampleBody(input.kind),
    '',
    '      errorHandling:',
    '        kind: ContinueOnErrorBehavior',
  ].join('\n')
}
