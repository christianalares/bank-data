# Open Payments sandbox probe

`scripts/open-payments-sandbox-smoke.mjs` exercises synthetic giro payments,
readback, simulated authorization, status consistency and cancellation. It is
isolated from MCP, the database and production configuration. A failed simulator
check remains a failed check; sandbox behavior does not establish production
eligibility, pricing, mandatory approval or settlement behavior.

Run with Node 22+ and credentials in a Git-ignored environment file:

```sh
node --env-file=.env.openpayments-sandbox scripts/open-payments-sandbox-smoke.mjs --run
```

Set `OPEN_PAYMENTS_SANDBOX_CLIENT_ID` and
`OPEN_PAYMENTS_SANDBOX_CLIENT_SECRET`; the script also accepts `OP_CLIENT_ID`
and `OP_CLIENT_SECRET`. Running without arguments sends no requests.
`--cancellation-only` limits the probe to discovery and one unsigned synthetic
payment/cancellation case.

The hosts are fixed to the provider sandbox. The script rejects redirects,
bounds requests and polling, never automatically retries a payment POST, and
attempts cancellation in `finally`. Confirm `CANC` before considering cleanup
complete. Keep credential values, authorization links and challenge data private.

All payment examples are synthetic. The example IBAN and negative-case PSU
identifiers come from the provider's [sandbox documentation](https://docs.openpayments.io/docs/sandbox).
Do not substitute production accounts or treat sandbox acceptance as approval
for a production payment integration.
