# Payment API comparison for SEB company invoices

Research date: 2026-10-10. Public primary sources only; no vendor contact, registration, account connection, or payment test. This is feasibility research, not confirmation of production eligibility or a selected implementation.

## Required use case

The assistant reads an invoice and supplies structured instructions; the MCP validates and submits them. Payments come from the company's SEB Sweden account to arbitrary Swedish suppliers, usually Bankgiro/Plusgiro with OCR, in SEK, potentially on a future date. One person approves; confirmed volume is 1–10 company invoices/month. The bank/provider must prevent execution without the user's transaction-specific bank approval even if MCP credentials are compromised. A same-iPhone authorization flow is required. Merchant checkout acceptance and generic Swedish account-data coverage do not establish this use case.

## Shortlist and public costs

No complete free production fit was verified. Quotes must include setup, monthly minimum/platform charge, per-payment charge, licence/regulated-service coverage, business-account activation, scheduled-payment modules, and bank fees. Free sandbox access does not imply free live payments.

| Provider | Evidence of fit | Public production cost | Remaining uncertainty |
| --- | --- | --- | --- |
| Open Payments | Corporate Swedish giro quickstart uses SEB BIC, Bankgiro/Plusgiro, OCR and execution date | Current pricing is tailored quotes; FAQ advertises free start and free licence use but gives no defined live allowance | Low-volume own-company onboarding, full live costs and mandatory approval |
| Mastercard Open Banking Europe / Aiia | Official SEB adapter notice explicitly describes **BankGiro/PlusGiro corporate payments** and creditor references; official repository includes payout APIs | No numeric production tariff found in reviewed primary sources; commercial quote needed | Internal single-company access, scheduling, OCR rules, same-iPhone flow, mandatory approval/exemption behavior, price |
| ZTL | API has Swedish giro destinations, OCR/message references, due date, company onboarding, separate approval and status phases | Terms specify transaction and subscription fees prevailing in the payment/ERP solution; no numeric direct-API tariff found | **SEB Sweden production support unconfirmed**, licensing/commercial arrangement for a single internal app, fees, approval guarantee |
| Tink | SEB Sweden PIS announced; API enumerates SEK, `SE_BG`, `SE_PG` | Payment Initiation is **Enterprise-only**, tailored quote | Exact SEB corporate product coverage, scheduling, arbitrary supplier payees, small internal app eligibility, price |
| Neonomics Nello Pay | API supports BGNR/PGNR, scheduled domestic transfers and business/corporate customer types; hosted product can use provider licence | Published default NOK view: **4,000 NOK setup + 5,600 NOK/month + 3 NOK/business payment** at lowest price below 1,000 transactions/month; risk/type can increase transaction fee | Hosted licensed route must explicitly permit outbound supplier payments; SEB corporate coverage and enforced approval unverified. Raw direct API route requires own PISP licence per FAQ |

Open Payments and Mastercard/Aiia are the strongest candidates for low-volume quotes based on concrete SEB corporate giro evidence. Neonomics' published monthly charge appears poorly matched to a few company invoices (judgment, not a vendor eligibility determination).

### Open Payments evidence and free-access ambiguity

The [corporate PIS quickstart](https://docs.openpayments.io/docs/quickstart_pis) includes a Swedish giro example with SEB BIC `ESSESESS`, Bankgiro/Plusgiro destination, OCR/invoice reference and requested execution date. Its [current pricing page](https://www.openpayments.io/pricing) gives tailored quotes based on service, volume, banks and solution setup, without numeric prices or minimums.

The [international-payments FAQ](https://www.openpayments.io/international-payments) says licence use is free, advertises no startup fees or lock-up for starting to build, and says users can start for free. It does not define a free production payment allowance. These claims warrant explicitly asking whether 1–10 live supplier payments/month can be free; neither a free live route nor a required paid minimum was established. See `SEB-PAYMENTS-RESEARCH.md` for security and onboarding details.

### Direct SEB route and a bank-price benchmark

SEB's [integration services](https://sebgroup.com/our-offering/cash-management/integration-services) restrict PSD2 API access to certified third-party providers and describe other corporate integration services. No free self-service API entitlement for this company's private MCP was verified. The [official payment-product matrix](https://raw.githubusercontent.com/seb-oss/openbanking/master/PSD2-release-notes/v8/payment_product_availability.md) lists the corporate Swedish domestic alias product, so the bank-side capability exists.

SEB's [partner accounting-system connection](https://seb.se/foretag/digitala-tjanster/koppla-ditt-affarssystem-till-oss/automatisk-bokforing) costs **75 SEK/month/account**, transfers payment files to online banking for approval, and requires a supported business/accounting system. The [bank price list](https://seb.se/foretag/tjanster/aktuella-priser) lists Bankgiro payments at **1.85 SEK** and Plusgiro at **3 SEK** in this integration category. Ten Bankgiro payments would therefore be **93.50 SEK/month in these bank components**, excluding accounting-system/provider fees and the underlying bank package. This is a benchmark, not a private MCP API quote or a fee assumed to apply to PSD2 payments. An accounting-system API might be worth checking if the company already pays for a supported system, but was not evaluated here.

### Billecta: conditional alternative, weaker approval fit

Billecta's [API reference](https://docs.billecta.com/reference) documents outgoing payments from the company's own Bankgiro through `POST /v1/payments/outgoingpayments`. The `BankIdReferenceToken` is optional by default; support can configure a requirement for valid BankID tokens. Other supplier-payment paths also exist. This does not yet establish bank-controlled approval, transaction binding, replay prevention or enforcement across all credential-accessible execution paths.

The [API introduction](https://docs.billecta.com/api) says production BankID features require the company's own BankID relying-party agreement/certificate and offers certificate-setup help for **5,000 SEK**. This is optional setup assistance, not the ongoing payment API price. [General terms](https://app.billecta.com/ht/GeneralTermsAndConditions) place prices in the logged-in service or an individual quote. SEB debit setup, supplier OCR/date support and full costs remain unverified. Lower priority than bank PIS for the user's security requirement.

### Mastercard / Aiia evidence

The [official SEB adapter notice](https://status.aiia.eu/incidents/9vqtcyskvh4q), resolved on 2026-10-05, explicitly covers corporate BankGiro/PlusGiro payments: provide a message or `Identifiers.CreditorReference`, and the destination name has a 35-character maximum. The [official incident JSON](https://status.aiia.eu/api/v2/incidents/9vqtcyskvh4q.json) was retrieved with curl when the browser research tool could not access the page. This establishes a concrete SEB corporate giro adapter, but not commercial entitlement or every desired feature.

[Mastercard's official API collections](https://github.com/Mastercard/open-banking-eu-postman-collections) include Aiia Pay, and [the Aiia payout example](https://www.postman.com/aiiaapi/aiia-api-workspace/request/y0mn5r6/create-payment) includes destination details and an optional specific execution date. [Aiia's user terms](https://cdn.aiia.eu/public/aiia-terms-of-use.pdf) describe user confirmation of source, amount and recipient followed by bank authorization. They do not establish an enforceable no-exemption contract for this application. No public price/free live allowance was found in reviewed official material. Treat private-app eligibility as unknown.

### ZTL evidence

[Domestic initiation reference](https://docs.ztlpay.io/api-reference/operations/paymentinitiationv2/) supports `swedishgiro`, `BANKGIRO`/`PLUSGIRO`, OCR or text references, currency and due date. [Domestic guide](https://docs.ztlpay.io/guides/domestic-payments/) separates payment creation, approval/signing and final status polling. This is structurally suited to outbound business invoice payments, unlike a merchant-only checkout product.

ZTL's [capability rules](https://docs.ztlpay.io/getting-started/capabilities-and-constraints/) say availability differs by environment, partner, bank and product. The [supported-bank endpoint](https://docs.ztlpay.io/api-reference/operations/getsupportedbanksbycountrycode/) requires authentication and was **not queried**; country-level Sweden support does not confirm SEB. Their [terms, section 10](https://www.ztlpay.io/terms-and-conditions/) specify subscription and transaction fees shown in the payment/ERP system. An API schema alone neither grants production access nor proves approval cannot be bypassed.

### Tink evidence

[Pricing](https://tink.com/pricing/) explicitly places Payment Initiation among Enterprise-only products and directs prospects to personalized pricing. [Payment API](https://docs.tink.com/api-payment) lists SEK and Swedish Bankgiro/Plusgiro identifier types. The [changelog](https://docs.tink.com/changelog) announced SEB Sweden payment initiation on 2021-01-13; this is historical evidence, not a current SEB corporate coverage guarantee. [Getting-started documentation](https://docs.tink.com/resources/one-time-payments/start-payment) distinguishes sandbox test providers from individually verified production apps. Public references demonstrate capability, not a free live service or acceptance of this low-volume app.

### Neonomics evidence and cost example

[Nello Pay pricing](https://www.neonomics.io/nello-pay) publishes the figures above in its default Norwegian currency view. The same page advertises free sandbox testing. Its commercial positioning is merchant payments, so the published tariff must **not** be treated as an offer for arbitrary outbound supplier invoices without confirmation.

The [customer FAQ](https://www.neonomics.io/customers-frequently-asked-questions) distinguishes direct API customers with their own PISP licence from a hosted flow using Neonomics' licence; direct payouts depend on setup/use case and may need further due diligence. [API payment documentation](https://docs.neonomics.io/docs/payments-1) lists Swedish BGNR/PGNR schemes and scheduled domestic payments. [Authorization API](https://docs.neonomics.io/reference/continueauth) supports `BUSINESS` and `CORPORATE`, subject to bank capabilities, and describes authorization when SCA is required. This wording does not establish mandatory SCA for every payment.

For **10 business payments/month**, purely illustrative and assuming this tariff applied: recurring provider cost is `5,600 + 10 × 3 = 5,630 NOK/month`, plus the initial 4,000 NOK and any bank fees. This is not a SEK quote, and no currency conversion is assumed. General comparison formula: `monthly fixed/minimum charges + payment count × provider fee + bank fees`, with setup and optional modules separate. At the confirmed 1–10 invoices/month, the monthly minimum dominates the cost; the illustrative published recurring range would be 5,603–5,630 NOK, if applicable.

## Other providers examined

- **TrueLayer:** current [payment-provider search reference](https://docs.truelayer.com/docs/get-information-about-banking-providers) lists supported countries and currencies; Sweden and SEK are absent. Exclude for the specified SEB Sweden SEK invoice use case unless the vendor supplies new explicit coverage evidence.
- **finAPI:** unusually transparent [own-use pricing](https://www.finapi.io/en/prices/): Access for up to 10 own accounts is EUR 200/month, payments up to 200 orders another EUR 50/month, then EUR 0.10 per additional order. The page says own-account users do not require a PSD2 licence for that arrangement. However, no SEB Sweden Bankgiro/Plusgiro support was verified; its [company coverage description](https://www.finapi.io/en/about-finapi/about-us/) lists continental markets and not Sweden. A EUR 50 standalone payment tariff is a different package and must not be substituted for the advertised own-use total. Not shortlisted.
- **Yapily:** [Connect](https://www.yapily.com/solution/payments) permits use of its licence and mentions consumer/business coverage. [Country page](https://www.yapily.com/product/open-banking-country-coverage) lists Sweden, but no SEB corporate giro/OCR evidence was established. An [official pricing brochure](https://assets.ctfassets.net/3ndxs7efitel/6jwgqx7zzZgY5838AanSug/75f560b138c35cc82b3dd2353eec5229/Yapily_Data_Portfolio.pdf) describes monthly platform pricing plus additional licence-use/services charges, without amounts. The brochure is older; use only to understand possible cost components. Lower priority until exact bank/product support is confirmed.
- **Salt Edge:** [partner PIS documentation](https://docs.saltedge.com/partners_payment_initiation/v1/) offers a licensed-partner route for companies without their own PISP licence. [Product page](https://www.saltedge.com/products/payment_initiation) directs buyers to sales. No numeric live tariff or verified SEB company Swedish giro/scheduling combination found. Lower priority, not proven unsuitable.

## Questions that determine a usable quote

Ask the strongest providers for a single Swedish company's internal own-account app at **1–10 company invoices/month**, explicitly **outbound arbitrary supplier invoices**, not accepting customer payments. Request confirmation of SEB company accounts, SEK Bankgiro/Plusgiro and OCR, scheduling, bank-side per-payment approval without authentication exemptions or reusable authorization, and same-iPhone BankID opening/return flow. Ask whether approval covers recipient, amount, source and reference and how status distinguishes accepted, authorized, executed, rejected and unknown. Obtain low-volume pricing including minimum contract term, platform/licence charges, bank fees and production activation before coding against a paid route.

### Unsent quote request

> We need an internal payment integration for our own Swedish company's SEB account, with one signer and 1–10 Swedish supplier invoices per month. Can we initiate payments to arbitrary Bankgiro/Plusgiro recipients with OCR and future dates under your licence, with mandatory bank approval for every payment and an authorization flow on the same iPhone? Please quote setup, monthly minimum/platform/licence and per-payment costs, identify any separate SEB fees, and confirm whether a free live allowance or pay-per-use plan without a minimum is available. We do not need account-data aggregation. Please identify whether any route accessible using our API credentials could execute a payment without fresh user approval.
