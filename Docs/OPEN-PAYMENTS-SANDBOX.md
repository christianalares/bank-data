# Open Payments sandbox investigation

Test date: 2026-10-11. Bank: SEB Sweden (`ESSESESS`), corporate context.

The user created an Open Payments developer account and authorized API tests
using locally saved credentials. The portal was in sandbox mode and still
offered a request for production access. This investigation used only synthetic
payments and the provider's sandbox hosts. No money moved and no real BankID
session was opened.

## Observed results

Final run: **52 checks, 44 passed, 8 failed** (exit code 1). Six failures are
missing giro/reference fields on resource reads; two are inconsistent payment
statuses after failed authorization. All six synthetic resources created by
this final run were subsequently cancelled, with HTTP 204 followed by `CANC`.

| Check | Result |
| --- | --- |
| OAuth client credentials | HTTP 200, bearer token, approximately one-hour expiry. Requested `accountinformation paymentinitiation corporate`; both APIs accepted the token. The response omitted the optional `scope` field. |
| Request without a bearer token | HTTP 401. |
| SEB discovery | Listed among Swedish sandbox banks. Its capabilities include `swedish-giro` and signing baskets with a limit of 100. Basket creation was not tested. |
| Bankgiro with OCR | HTTP 201 and `RCVD` for a synthetic SEK 1.00 invoice with a future execution date. |
| Plusgiro with invoice reference | HTTP 201 and `RCVD` for a synthetic SEK 1.00 invoice with a future execution date. |
| Read payment back | Amount, source account, recipient name and execution date can be checked. Giro and OCR/invoice-reference fields are absent from the response; these cannot be verified by reading the resource back. |
| Before approval | Payment status was `RCVD`. |
| Same-device method | `mbid_same_device` was advertised. Selecting it returned `DECOUPLED`, `started`, and challenge data. No challenge was opened or logged. |
| Normal simulated approval | Authorization became `finalised`, payment became `ACSP` (accepted for processing). This is not evidence of settlement. |
| Expired approval | Authorization became `failed` with `AUTHENTICATION_SESSION_EXPIRED`, but payment status was `ACSP`. This is an inconsistent simulation result. |
| BankID unavailable | Authorization became `failed` with `BANKID_NOT_ACTIVATED`, but payment status was `ACSP`. This is an inconsistent simulation result. |
| Additional signer required | Authorization became `finalised`, payment remained `PATC` with `AUTHORISATION_PENDING_API`. One signer's successful approval does not mean the payment is complete. |
| Cancel unsigned payment | DELETE returned HTTP 204, then payment status returned `CANC`. |
| Cleanup after each approval scenario | All five additional final-run resources also returned HTTP 204 and `CANC`. |

The smoke script deliberately reports failure for missing payment fields and
for inconsistent authorization/payment outcomes. An HTTP 200 alone does not
make these checks pass. These findings prevent declaring full acceptance; they
do not establish that SEB's production system bypasses BankID.

## Reproduce safely

The standalone script is `scripts/open-payments-sandbox-smoke.mjs`. It requires
Node 22+ with environment-file support and the local, Git-ignored `.env`:

```sh
node --env-file=.env scripts/open-payments-sandbox-smoke.mjs --run
```

It accepts `OP_CLIENT_ID` and `OP_CLIENT_SECRET`, or explicitly named
`OPEN_PAYMENTS_SANDBOX_CLIENT_ID` and `OPEN_PAYMENTS_SANDBOX_CLIENT_SECRET`.
Keep credential values out of source control, terminal arguments and reports.
Running with no arguments prints help and sends no requests. Append
`--cancellation-only` to run bank discovery and one unsigned payment/cancellation
case. A new run creates new synthetic resources.

The script fixes both OAuth and API hosts to their sandbox addresses, rejects
HTTP redirects, uses only documented example/synthetic data, has bounded
requests and polling, and never automatically retries a payment POST. Output
contains selected test metadata only, excluding tokens, client credentials,
challenge values and authorization links. After each created resource, it
attempts cancellation in `finally` and requires `CANC` to confirm cleanup.
An asynchronous cancellation requiring further signing is reported as
unconfirmed rather than silently treated as completed.

## What this leaves unresolved

- Production eligibility and pricing for this company's internal tool. Sandbox
  access does not demonstrate free production access.
- Whether the actual SEB account supports this exact Bankgiro/Plusgiro, OCR and
  future-date flow, including rejection of invalid invoice details.
- Mandatory independent bank approval for every live payment, including any
  exemptions or settings that API credentials could change.
- The real same-iPhone journey, displayed payee/amount details, returning to the
  initiating application, and rejection/cancellation behavior.
- Live execution and reconciliation, duplicate prevention, and recovery after a
  timeout with an unknown payment-creation outcome. `X-Request-ID` is documented
  for tracing; it is not a documented universal idempotency key.

The deployed MCP and production database were not changed. This script is a
development probe, not a payment implementation or a production acceptance test.

Local validation: `node --check scripts/open-payments-sandbox-smoke.mjs`,
`pnpm check` (40 files), and `git diff --check` passed. The network suite's failed
checks above remain recorded; they were not changed to pass around simulator
limitations.

## Primary documentation inspected

- [Get started](https://docs.openpayments.io/docs/getstarted): sandbox app
  credentials; separate production approval and client certificate.
- [Sandbox environment](https://docs.openpayments.io/docs/sandbox): exact hosts,
  scope difference for bank discovery, synthetic identifiers and negative cases.
- [Access tokens](https://docs.openpayments.io/docs/get_access_token): OAuth
  client credentials and corporate scopes.
- [Bank discovery](https://docs.openpayments.io/docs/list_banks): SEB capabilities
  and signing-basket limits.
- [Payment guide](https://docs.openpayments.io/docs/quickstart_pis): Swedish giro,
  OCR/invoice reference and execution-date request fields.
- [Authorization guide](https://docs.openpayments.io/docs/authorisations):
  same-device method, decoupled flow and automatic sandbox progression without
  user action.
- [OpenAPI specification](https://docs.openpayments.io/openpayments_api.yaml):
  resource reads, cancellation and status operations. The generic payment-read
  schema omits the giro-specific fields.
- [Request conventions](https://docs.openpayments.io/docs/api): request tracing.
