import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

// Intentionally isolated from the MCP, database, and production configuration.
// Never add a configurable API origin to this script.
const apiOrigin = 'https://api.sandbox.openbankingplatform.com'
const tokenUrl = 'https://oauth.sandbox.openbankingplatform.com/connect/token'
const paymentPath = '/psd2/paymentinitiation/v1/payments/swedish-giro'
const scope = 'accountinformation paymentinitiation corporate'
const results = []
let accessToken

const cancellationOnly = process.argv[3] === '--cancellation-only'
if (
  process.argv[2] !== '--run' ||
  process.argv.length > 4 ||
  (process.argv.length === 4 && !cancellationOnly)
) {
  console.log(`Open Payments sandbox smoke test (Node 22+).
Creates synthetic payments and exercises simulated authorisation; no real funds.
Set OPEN_PAYMENTS_SANDBOX_CLIENT_ID and OPEN_PAYMENTS_SANDBOX_CLIENT_SECRET
in an ignored environment file, then run:
  node --env-file=.env.openpayments-sandbox scripts/open-payments-sandbox-smoke.mjs --run
Existing OP_CLIENT_ID / OP_CLIENT_SECRET names are also accepted.
Append --cancellation-only to test just an unsigned payment and cancellation.
Outputs only allowlisted test metadata; never tokens, challenges, or credentials.`)
} else {
  try {
    await run()
  } catch {
    // Do not print arbitrary exception bodies: they may contain credentials.
    record('run', false, { error: 'Stopped safely; review preceding test metadata.' })
  }
  console.log(JSON.stringify({ sandboxOnly: true, results }, null, 2))
  if (results.some((result) => !result.passed)) process.exitCode = 1
}

function record(test, passed, details = {}) {
  const result = { test, passed, ...details }
  results.push(result)
  console.log(JSON.stringify(result))
  return passed
}

function codes(body) {
  return (body.tppMessages ?? [])
    .map((message) => message.code)
    .filter((code) => typeof code === 'string' && /^[A-Z_]+$/.test(code))
}

function headers(psu = '99990101000') {
  return {
    'X-Request-ID': randomUUID(),
    'X-BicFi': 'ESSESESS',
    'PSU-ID': psu,
    'PSU-Corporate-ID': '9999999990',
    'TPP-Redirect-Preferred': 'false',
    // Synthetic metadata, only ever sent to the sandbox.
    'PSU-IP-Address': '192.0.2.1',
    'PSU-User-Agent': 'bank-data-sandbox-smoke/1.0',
  }
}

async function request(path, { method = 'GET', body, psu, unauthenticated = false } = {}) {
  const url = new URL(path, apiOrigin)
  if (url.origin !== apiOrigin || !url.pathname.startsWith('/psd2/')) {
    throw new Error('Sandbox URL boundary rejected')
  }
  const response = await fetch(url, {
    method,
    headers: {
      ...headers(psu),
      ...(unauthenticated ? {} : { Authorization: `Bearer ${accessToken}` }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  const data = await response.json().catch(() => ({}))
  return {
    ok: response.ok,
    status: response.status,
    body: data,
    approach: response.headers.get('aspsp-sca-approach'),
  }
}

function fixture(giroType = 'BANKGIRO') {
  const execution = new Date()
  execution.setUTCDate(execution.getUTCDate() + 7)
  while ([0, 6].includes(execution.getUTCDay())) {
    execution.setUTCDate(execution.getUTCDate() + 1)
  }
  return {
    instructedAmount: { amount: '1.00', currency: 'SEK' },
    // Public documentation example; not a customer's bank account.
    debtorAccount: { iban: 'SE4550000000058398257466', currency: 'SEK' },
    creditorGiro: { giroNumber: '1234-5678', giroType },
    creditorName: 'Sandbox Test Supplier AB',
    requestedExecutionDate: execution.toISOString().slice(0, 10),
    ...(giroType === 'BANKGIRO' ? { ocrRef: '1234567897' } : { invoiceRef: 'TEST-INVOICE-001' }),
  }
}

async function run() {
  const clientId = process.env.OPEN_PAYMENTS_SANDBOX_CLIENT_ID ?? process.env.OP_CLIENT_ID
  const clientSecret =
    process.env.OPEN_PAYMENTS_SANDBOX_CLIENT_SECRET ?? process.env.OP_CLIENT_SECRET
  if (!record('credentials present', Boolean(clientId && clientSecret))) return
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  const token = await response.json().catch(() => ({}))
  const granted = new Set(String(token.scope ?? '').split(' '))
  if (
    !record(
      'OAuth token for requested corporate scopes',
      response.ok &&
        typeof token.access_token === 'string' &&
        token.token_type === 'Bearer' &&
        (token.scope === undefined || scope.split(' ').every((item) => granted.has(item))),
      {
        httpStatus: response.status,
        tokenTypeIsBearer: token.token_type === 'Bearer',
        scopeFieldPresent: token.scope !== undefined,
        expiresIn: typeof token.expires_in === 'number' ? token.expires_in : null,
      },
    )
  )
    return
  accessToken = token.access_token

  const unauthorized = await request('/psd2/aspspinformation/v1/aspsps', { unauthenticated: true })
  record('unauthenticated request rejected', unauthorized.status === 401, {
    httpStatus: unauthorized.status,
  })
  const banks = await request('/psd2/aspspinformation/v1/aspsps?isoCountryCodes=SE')
  const seb = banks.body.aspsps?.find((bank) => bank.bicFi === 'ESSESESS')
  if (
    !record('SEB listed in Swedish sandbox banks', banks.ok && Boolean(seb), {
      httpStatus: banks.status,
    })
  )
    return
  const details = await request('/psd2/aspspinformation/v1/aspsps/ESSESESS')
  if (
    !record(
      'SEB advertises Swedish giro',
      details.ok && details.body.globalPaymentProducts?.includes('swedish-giro'),
      {
        httpStatus: details.status,
        products: details.body.globalPaymentProducts,
        signingBasketsSupported: details.body.paymentInitiation?.signingBasketsSupported,
        signingBasketLimit: details.body.paymentInitiation?.signingBasketLimit,
      },
    )
  )
    return

  await paymentScenario({
    name: 'unsigned cancellation',
    psu: '99990101000',
    type: 'BANKGIRO',
    cancelOnly: true,
  })
  if (cancellationOnly) return

  // Each case creates a new, uniquely identified sandbox resource. POSTs are not retried.
  for (const scenario of [
    { name: 'Bankgiro OCR', psu: '99990101000', type: 'BANKGIRO', expected: 'finalised' },
    {
      name: 'Plusgiro invoice reference',
      psu: '99990101000',
      type: 'PLUSGIRO',
      expected: 'finalised',
    },
    {
      name: 'expired approval',
      psu: '99990101004',
      type: 'BANKGIRO',
      expected: 'failed',
      code: 'AUTHENTICATION_SESSION_EXPIRED',
    },
    {
      name: 'BankID unavailable',
      psu: '99990101005',
      type: 'BANKGIRO',
      expected: 'failed',
      code: 'BANKID_NOT_ACTIVATED',
    },
    {
      name: 'second signer required',
      psu: '99990101002',
      type: 'BANKGIRO',
      expected: 'finalised',
      code: 'AUTHORISATION_PENDING_API',
    },
  ]) {
    await paymentScenario(scenario)
  }
}

async function paymentScenario(scenario) {
  const body = fixture(scenario.type)
  const created = await request(paymentPath, { method: 'POST', body, psu: scenario.psu })
  const id = created.body.paymentId
  if (
    !record(
      `${scenario.name}: create`,
      created.ok && typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id),
      {
        httpStatus: created.status,
        transactionStatus: created.body.transactionStatus,
        codes: codes(created.body),
      },
    )
  )
    return
  const path = `${paymentPath}/${id}`
  try {
    await inspectAndAuthorise(scenario, body, path, created)
  } finally {
    await cancelPayment(scenario, path)
  }
}

async function inspectAndAuthorise(scenario, body, path, created) {
  const read = await request(path, { psu: scenario.psu })
  const checked = [
    'instructedAmount',
    'debtorAccount',
    'creditorGiro',
    'creditorName',
    'requestedExecutionDate',
    scenario.type === 'BANKGIRO' ? 'ocrRef' : 'invoiceRef',
  ]
  const missing = checked.filter((key) => read.body[key] === undefined)
  const mismatches = checked.filter(
    (key) => read.body[key] !== undefined && !isDeepStrictEqual(read.body[key], body[key]),
  )
  record(
    `${scenario.name}: stored invoice fields`,
    read.ok && missing.length === 0 && mismatches.length === 0,
    {
      httpStatus: read.status,
      missing,
      mismatches,
    },
  )
  const before = await request(`${path}/status`, { psu: scenario.psu })
  record(
    `${scenario.name}: awaiting authorisation`,
    before.ok && before.body.transactionStatus === 'RCVD',
    {
      httpStatus: before.status,
      transactionStatus: before.body.transactionStatus,
    },
  )
  if (scenario.cancelOnly) return
  const auth = await request(`${path}/authorisations`, { method: 'POST', psu: scenario.psu })
  const authId = auth.body.authorisationId
  const methods = (auth.body.scaMethods ?? []).map((method) => method.authenticationMethodId)
  const selected = ['mbid_same_device', 'mbid'].find((method) => methods.includes(method))
  if (
    !record(
      `${scenario.name}: same-device method available`,
      auth.ok && Boolean(selected) && typeof authId === 'string' && /^[a-zA-Z0-9-]+$/.test(authId),
      { httpStatus: auth.status, methods },
    )
  )
    return
  const authPath = `${path}/authorisations/${authId}`
  const started = await request(authPath, {
    method: 'PUT',
    body: { authenticationMethodId: selected },
    psu: scenario.psu,
  })
  record(`${scenario.name}: simulated authorisation started`, started.ok, {
    httpStatus: started.status,
    approach: started.approach,
    scaStatus: started.body.scaStatus,
    sameDeviceChallengePresent: Boolean(started.body.challengeData?.data?.length),
  })
  let last = started
  const seenCodes = new Set([...codes(created.body), ...codes(auth.body), ...codes(started.body)])
  for (
    let attempt = 0;
    started.ok && attempt < 12 && !['finalised', 'failed'].includes(last.body.scaStatus);
    attempt++
  ) {
    await delay(1_000)
    last = await request(authPath, { psu: scenario.psu })
    for (const code of codes(last.body)) seenCodes.add(code)
    if (!last.ok) break
  }
  record(
    `${scenario.name}: simulated approval outcome`,
    last.ok && last.body.scaStatus === scenario.expected,
    {
      httpStatus: last.status,
      scaStatus: last.body.scaStatus,
      codes: [...seenCodes],
    },
  )
  const after = await request(`${path}/status`, { psu: scenario.psu })
  for (const code of codes(after.body)) seenCodes.add(code)
  const expectedPaymentStates =
    scenario.code === 'AUTHORISATION_PENDING_API'
      ? ['RCVD', 'PATC', 'ACTC', 'PDNG']
      : scenario.expected === 'failed'
        ? ['RCVD', 'RJCT', 'CANC', 'ACTC', 'PDNG']
        : ['ACSP', 'ACSC', 'ACCC']
  record(
    `${scenario.name}: payment status consistent with approval`,
    after.ok && expectedPaymentStates.includes(after.body.transactionStatus),
    {
      httpStatus: after.status,
      transactionStatus: after.body.transactionStatus,
      codes: codes(after.body),
    },
  )
  if (scenario.code)
    record(`${scenario.name}: expected warning`, seenCodes.has(scenario.code), {
      codes: [...seenCodes],
    })
}

async function cancelPayment(scenario, path) {
  try {
    const cancelled = await request(path, { method: 'DELETE', psu: scenario.psu })
    const after = await request(`${path}/status`, { psu: scenario.psu })
    record(
      `${scenario.name}: cancellation confirmed`,
      cancelled.ok && after.ok && after.body.transactionStatus === 'CANC',
      {
        httpStatus: cancelled.status,
        statusHttpStatus: after.status,
        transactionStatus: after.body.transactionStatus,
        additionalAuthorisationRequired: Boolean(cancelled.body._links?.startAuthorisation),
        codes: codes(cancelled.body),
      },
    )
  } catch {
    record(`${scenario.name}: cancellation confirmed`, false, {
      error: 'Cancellation could not be confirmed.',
    })
  }
}
