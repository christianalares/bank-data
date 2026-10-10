# SEB company invoice payments: feasibility research

Investigated: 2026-10-10. Scope: public documentation only; no onboarding,
external messages, payment submission, bank access, or production changes.

## Conclusion

The requested workflow looks technically feasible: the assistant reads an invoice
and supplies explicit payment fields; the MCP validates and prepares the specified
payment; the owner authorizes it independently at the bank; the MCP tracks status.
SEB publishes production corporate Bankgiro and PlusGiro payment APIs. A licensed
intermediary, particularly Open Payments, is a credible access route. This is a
feasibility finding, not confirmation of this company's eligibility or a tested
SEB/iPhone flow.

Mandatory bank approval for every payment is the user's accepted requirement.
It must be enforced by the bank/provider arrangement, including any alternative
capabilities available to stolen integration credentials. A local MCP rule alone
does not protect against compromise of the MCP host or provider credentials.

## Verified public evidence

### SEB supports the relevant corporate payment types

SEB's official availability matrix lists Swedish corporate Bankgiro and PlusGiro
payments in production under `corporate-se-domestic-alias-credit-transfers` in its
new Corporate Payment Initiation v1 API. The corresponding legacy v8 product
has a deprecation date of 2026-11-26. A new integration should confirm migration
support rather than assume the old endpoint will remain suitable. [SEB official
payment-product availability](https://raw.githubusercontent.com/seb-oss/openbanking/master/PSD2-release-notes/v8/payment_product_availability.md)

SEB says its PSD2 account-information and payment-initiation APIs are available
to certified third-party providers. Its business integration offerings also
include file integration through service providers; these are distinct access
arrangements, not automatic privileges of an ordinary business login. [SEB
integration services](https://sebgroup.com/our-offering/cash-management/integration-services)

### Existing Enable Banking access is not sufficient

Enable Banking's API reference says live payment initiation is restricted to
companies holding a PISP licence. Its knowledge base explicitly describes itself
as a technical service provider for licensed entities. Sandbox payments are
available without that production eligibility. Restricted own-account activation
for account information should not be assumed to override the payment restriction.
[Enable Banking API reference](https://enablebanking.com/docs/api/reference/#payments),
[Enable Banking knowledge base](https://enablebanking.com/knowledge-base)

### Open Payments is a plausible alternative

Open Payments identifies itself as a Swedish supervised payment institution with
AIS, PIS and payment-execution permissions. Its FAQ explicitly says customers do
not need their own licence and can use Open Payments' licence. That does not
establish acceptance of a bespoke, low-volume own-company MCP application, and
the statement that licence use is free does not mean the API service is free.
[Open Payments company information](https://www.openpayments.io/company),
[Open Payments licensing FAQ](https://www.openpayments.io/international-payments)

Its PIS guide specifies `paymentinitiation corporate` access and a Swedish giro
endpoint. The documented fields include SEK amount, debtor account, Bankgiro or
PlusGiro recipient, recipient name, execution date, invoice reference and OCR
reference; the example targets SEB's `ESSESESS` BIC. Payment creation returns a
payment identifier and authorization link; the guide then requires customer
authorization and status polling. OCR-validation warnings are documented.
[Open Payments payment guide](https://docs.openpayments.io/docs/quickstart_pis)

The same guide requires customer IP address and browser user agent. Design the
customer review/authorization entry point in a browser so these values come from
the customer's request; do not substitute the MCP host's or model server's IP.
The exact provider requirements for initiating from a remote MCP must be confirmed.
[Open Payments payment guide](https://docs.openpayments.io/docs/quickstart_pis)

Open Payments also documents a direct SEB ISO 20022 integration that involves
ordering a business service and appropriate bank permissions. It is a possible
fallback; its authorization properties must be evaluated separately from PSD2.
[Open Payments SEB onboarding](https://www.openpayments.io/integrera/seb-en)

Its separate SEB PSD2 onboarding page describes activation inside a financial
management system connected to Open Payments, after first logging into the
company's online bank with BankID. That is evidence of a supported business flow,
not a self-service eligibility promise for this private MCP. [Open Payments SEB
PSD2 onboarding](https://www.openpayments.io/integrera/seb-psd2-en)

### Same-iPhone BankID is supported in principle

BankID documents starting its app on the same mobile device via a universal link
on iOS. No phone-to-itself QR scan is needed for this pattern. This establishes
BankID's capability, not that a particular SEB/provider redirect implements it.
[BankID autostart](https://developers.bankid.com/getting-started/frontend/autostart)

BankID's return guidance explains session binding using a nonce, completion
verification and browser-return limitations. A web return can open the default
browser instead of the original chat app or tab. Test from the user's actual
iPhone chat client, through bank authorization and back to a status page.
[BankID return URL guidance](https://developers.bankid.com/how-to-guides/return-url)

### Authorization is not automatically a guarantee of BankID every time

Open Payments' status vocabulary includes `exempted`, indicating successful
authorization without SCA, as well as `finalised`. Public generic documentation
does not prove that SEB uses such exemptions for this company, but it prevents
us from assuming that every PIS call necessarily requires a fresh BankID signature.
Require a provider/bank guarantee for this use case before relying on BankID as
the independent security boundary. [Open Payments statuses and types](https://docs.openpayments.io/docs/enums)

## Unresolved gates

1. Provider accepts the company's bespoke own-account MCP application and supplies
   production corporate payment access under its licence.
2. Exact SEB account/service prerequisites, signatory permissions and onboarding
   are established without granting unattended execution privileges.
3. Every payment needs explicit bank-side approval bound to its recipient and
   amount; stolen credentials cannot execute payments through exemptions,
   trusted-beneficiary rules, standing instructions or another ISO/API route.
4. SEB production supports both giro types, correct OCR/reference handling and
   future dates through the provider's current connector.
5. Same-iPhone approval works from the intended chat/browser client, and the bank
   shows enough payment details for the user to detect a substituted recipient.
6. Costs and minimum volumes are acceptable. Public sources do not establish a
   quote for this use case.
7. Safe retry/idempotency semantics and status meanings are confirmed. A received,
   authorized or scheduled payment must not be presented as recipient settlement.

## Draft questions for Open Payments

These are prepared for the user to send; no message has been sent.

> We are a Swedish company using SEB Business Arena, with one authorized signatory.
> We want a private integration for our own company account: an assistant reads
> Swedish invoices and sends structured payment instructions to our MCP server.
> We require an independent bank approval for every payment, preferably BankID
> on the same iPhone. We do not want unattended payment privileges.
>
> 1. Can you onboard this own-account bespoke application under your PISP licence,
>    without our company obtaining a payment-services licence or becoming an agent?
> 2. Does your production SEB corporate connector support Bankgiro, PlusGiro, OCR,
>    invoice references and scheduled execution dates? Is it using the replacement
>    Corporate v1 API for the products whose v8 deprecation date is 2026-11-26?
> 3. Can SEB/provider enforce fresh approval for every payment, with no SCA
>    exemptions or trusted-recipient bypass? What can stolen API credentials do,
>    including through ISO, batches or other enabled products?
> 4. Is redirect-based approval available for a single giro payment, and does it
>    open BankID on the same iPhone from Safari or a chat app's browser? How many
>    signatures are required, and where are amount and recipient displayed?
> 5. Which SEB agreement, services and permissions must our company activate?
> 6. How should an MCP integration supply PSU IP/user-agent, bind redirects to the
>    customer session, recover from timeouts, avoid duplicates and confirm status?
> 7. What are onboarding, minimum monthly, per-payment and bank fees, contract
>    commitments and sandbox/test options for low payment volume?

## Practical next step

Obtain written provider answers to these gates before implementing a payment
connector. If eligible, prove the full approval flow in sandbox before any live
test. An eventual small live payment would need separate explicit user approval.
Public research alone cannot close company-specific access, cost or physical
iPhone acceptance gates.

## Current-code assessment and proposed implementation boundaries

Local inspection found only read tools in the business/all-bank MCP contexts and
separate bank-consent tools in `src/mcp/mcp-server.ts`. HTTP bearer authentication
resolves business, all-bank, consent and personal contexts in
`src/mcp/http-server.ts`; there is no payment permission context.
`src/banking/index.ts` requests the provider's AIS bank metadata and implements
account/session/transaction access. No payment workflow or payment lifecycle
storage is implemented. These are source observations, not a production security
audit or evidence of live payment eligibility.

Proposed boundaries, subject to a later implementation decision:

- Use separate payment credentials, permissions and preferably a separate service
  from the existing bank reads. Fix the allowed company and debit accounts in
  server configuration; do not let invoice text or model instructions expand them.
- Keep invoice interpretation outside the MCP. Accept explicit validated amount,
  currency, recipient, reference and execution-date fields, with a stable invoice
  identifier for duplicate detection. An invoice identifier alone is not enough:
  detect equivalent instructions and serialize concurrent attempts as well.
- Bind a frozen instruction to its provider payment ID and bank authorization.
  A changed recipient or amount requires a new payment and new approval. Verify
  that bank-controlled screens show the actual instruction, not only a supplier
  name supplied by the assistant. BankID login alone is not payment approval.
- Treat local allowlists, limits and audit records as defense in depth. A host
  compromise can bypass local rules; the independent bank approval requirement
  must survive stolen server credentials. Detecting an exemption after execution
  cannot prevent the payment, so this gate must be resolved before submission.
- Add per-payment/daily limits, recipient-change checks, expiration, rate limits,
  revocation and audit evidence. Redact credentials and authorization URLs from
  logs. A new recipient needs independently checked destination details.
- Persist submission intent before contacting the provider. After a timeout,
  reconcile the existing attempt instead of blindly creating another payment.
  Confirm provider idempotency semantics; a unique request ID is not proof of
  duplicate suppression. Label authorization, scheduling and settlement distinctly.

Bank approval reduces the impact of prompt injection or a stolen MCP token only
if no execution path bypasses it. It cannot protect a user who signs a substituted
payment without checking the bank's recipient and amount. The iPhone acceptance
test must therefore cover payment-detail visibility as well as app switching.
