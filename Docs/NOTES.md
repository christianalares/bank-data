# Public design notes

This file contains reusable design decisions only. Keep bank selections, account
identifiers, balances, transactions, counts, consent state, sync times, deployment
addresses, connection names, credentials and private archive locations outside
this public repository, including commit messages and test fixtures.

## Information layer

- Store explicit records and evidence through Drizzle and MCP. Perform AI,
  document interpretation, classification and matching decisions outside the service.
- Keep payment state independent from transaction matching. Similar names or
  amounts never establish a confirmed match or completed payment.
- Validate workspace scope, exact references, revisions and idempotency. Preserve
  source bank history and immutable change history.
- Keep local accounting registers authoritative until an explicit, verified cutover.

## Bank synchronization

- Import booked transactions; exclude pending provider entries at the boundary.
- Preserve history across renewed consents. Use exact account identity and currency
  for overlap protection; stop on conflicting references.
- Treat provider outages and rate limits separately from integrity failures.
  Preserve the previous successful sync time when a connection fails.
- Use cursor pagination for complete reads and report freshness explicitly.

## Change acceptance

Run the relevant local checks. Before production changes, verify the target,
create a private backup, restore it into an isolated database, rehearse changes,
and compare exact records. Keep operational evidence in a private record.
A successful build or deployment alone does not establish production acceptance.
