-- Run only after migration 0015 and an authenticated MCP baseline comparison.
-- psql -X -v ON_ERROR_STOP=1 --single-transaction -f scripts/retire-disconnected-connections.sql
-- Set bank_data.expected_* session settings from a privately reviewed snapshot.
-- Missing settings abort before any deletion; never infer or copy public counts.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE bank_connection, bank_account, bank_transaction, attachment
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF (SELECT count(*) FROM bank_connection WHERE status = 'disconnected') <> current_setting('bank_data.expected_disconnected_connections')::bigint
    OR (SELECT count(*) FROM bank_connection WHERE status = 'connected') <> current_setting('bank_data.expected_connected_connections')::bigint
    OR (SELECT count(*) FROM bank_account WHERE connection_id IN
      (SELECT id FROM bank_connection WHERE status = 'disconnected')) <> current_setting('bank_data.expected_historical_accounts')::bigint
    OR (SELECT count(*) FROM bank_transaction WHERE connection_id IN
      (SELECT id FROM bank_connection WHERE status = 'disconnected')) <> current_setting('bank_data.expected_historical_transactions')::bigint
    OR (SELECT count(*) FROM attachment WHERE transaction_id IN
      (SELECT id FROM bank_transaction WHERE connection_id IN
        (SELECT id FROM bank_connection WHERE status = 'disconnected'))) <> current_setting('bank_data.expected_linked_attachments')::bigint
    OR (SELECT count(*) FROM bank_transaction WHERE status = 'booked') <> current_setting('bank_data.expected_booked_transactions')::bigint
    OR (SELECT count(*) FROM bank_transaction WHERE status = 'pending') <> 0
    OR (SELECT count(*) FROM attachment) <> current_setting('bank_data.expected_attachments')::bigint
    OR (SELECT count(*) FROM pg_constraint WHERE conname IN (
      'bank_account_connection_id_bank_connection_id_fk',
      'bank_transaction_connection_id_bank_connection_id_fk'
    ) AND confdeltype = 'n') <> 2
  THEN
    RAISE EXCEPTION 'Task 14 preconditions changed; no connection rows deleted';
  END IF;
END $$;

CREATE TEMP TABLE task14_accounts_before ON COMMIT DROP AS
  SELECT id, to_jsonb(a) - 'connection_id' AS row_without_connection
  FROM bank_account a;
CREATE TEMP TABLE task14_transactions_before ON COMMIT DROP AS
  SELECT id, to_jsonb(t) - 'connection_id' AS row_without_connection
  FROM bank_transaction t;
CREATE TEMP TABLE task14_attachments_before ON COMMIT DROP AS
  SELECT id, to_jsonb(a) AS complete_row FROM attachment a;
CREATE TEMP TABLE task14_active_connections_before ON COMMIT DROP AS
  SELECT id, to_jsonb(c) AS complete_row
  FROM bank_connection c WHERE status <> 'disconnected';

DELETE FROM bank_connection WHERE status = 'disconnected';

DO $$
BEGIN
  IF (SELECT count(*) FROM bank_connection WHERE status = 'disconnected') <> 0
    OR (SELECT count(*) FROM bank_account WHERE connection_id IS NULL) <> current_setting('bank_data.expected_historical_accounts')::bigint
    OR (SELECT count(*) FROM bank_transaction WHERE connection_id IS NULL) <> current_setting('bank_data.expected_historical_transactions')::bigint
    OR (SELECT count(*) FROM bank_transaction WHERE status = 'booked') <> current_setting('bank_data.expected_booked_transactions')::bigint
    OR (SELECT count(*) FROM attachment) <> current_setting('bank_data.expected_attachments')::bigint
    OR EXISTS (
      SELECT 1 FROM (
        (SELECT * FROM task14_accounts_before
         EXCEPT SELECT id, to_jsonb(a) - 'connection_id' FROM bank_account a)
        UNION ALL
        (SELECT id, to_jsonb(a) - 'connection_id' FROM bank_account a
         EXCEPT SELECT * FROM task14_accounts_before)
      ) differences
    )
    OR EXISTS (
      SELECT 1 FROM (
        (SELECT * FROM task14_transactions_before
         EXCEPT SELECT id, to_jsonb(t) - 'connection_id' FROM bank_transaction t)
        UNION ALL
        (SELECT id, to_jsonb(t) - 'connection_id' FROM bank_transaction t
         EXCEPT SELECT * FROM task14_transactions_before)
      ) differences
    )
    OR EXISTS (
      SELECT 1 FROM (
        (SELECT * FROM task14_attachments_before
         EXCEPT SELECT id, to_jsonb(a) FROM attachment a)
        UNION ALL
        (SELECT id, to_jsonb(a) FROM attachment a
         EXCEPT SELECT * FROM task14_attachments_before)
      ) differences
    )
    OR EXISTS (
      SELECT 1 FROM (
        (SELECT * FROM task14_active_connections_before
         EXCEPT SELECT id, to_jsonb(c) FROM bank_connection c)
        UNION ALL
        (SELECT id, to_jsonb(c) FROM bank_connection c
         EXCEPT SELECT * FROM task14_active_connections_before)
      ) differences
    )
  THEN
    RAISE EXCEPTION 'Task 14 preservation check failed; roll back the transaction';
  END IF;
END $$;
