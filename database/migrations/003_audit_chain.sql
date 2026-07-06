-- Kestrel KYC — Audit hash-chain hardening
-- Runs automatically after 002_pdpa.sql.
--
-- Fixes three defects in the original audit trail:
--   1. The chain hash covered only (prevHash + event_data), so session_id,
--      client_id, event_type and the actor could be altered undetected.
--   2. The read-latest-then-insert was not serialized, so concurrent appends
--      could read the same previous hash and fork the chain.
--   3. Two independent writers (the Go service and erase_session_pii) each
--      re-implemented the hashing, risking drift.
--
-- The chain hash is now computed by a single BEFORE INSERT trigger that all
-- writers share. It takes a transaction-scoped advisory lock so appends are
-- serialized, and it hashes the whole record. The canonical pre-image is:
--
--   prevHash || session_id || client_id || event_type || actor || event_data
--
-- where each nullable field is coalesced to '' and event_data uses Postgres'
-- normalized JSONB text form (so the Go verifier, reading event_data::text,
-- recomputes an identical pre-image).

BEGIN;

-- 1. Persist the actor (who performed the action). Previously accepted by the
--    API but silently dropped on insert.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor TEXT;

-- 2. Single, shared, concurrency-safe chain writer.
CREATE OR REPLACE FUNCTION audit_events_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev VARCHAR(64);
BEGIN
    -- Serialize appends: concurrent inserts block here until the in-flight
    -- append commits, so they can never read the same previous hash and fork
    -- the chain. The lock is released automatically at transaction end.
    PERFORM pg_advisory_xact_lock(hashtext('kestrel_audit_events_chain'));

    SELECT hash INTO v_prev
    FROM audit_events
    ORDER BY id DESC
    LIMIT 1;

    v_prev := COALESCE(v_prev, '');

    NEW.hash := encode(
        digest(
            v_prev
            || COALESCE(NEW.session_id::text, '')
            || COALESCE(NEW.client_id::text, '')
            || NEW.event_type
            || COALESCE(NEW.actor, '')
            || NEW.event_data::text,
            'sha256'
        ),
        'hex'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_chain_trg ON audit_events;
CREATE TRIGGER audit_events_chain_trg
    BEFORE INSERT ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION audit_events_chain();

-- 3. Re-point erase_session_pii at the shared writer: it no longer computes a
--    hash itself (the trigger does) and now records the actor.
CREATE OR REPLACE FUNCTION erase_session_pii(p_session_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_client_id UUID;
    v_event     JSONB;
BEGIN
    SELECT client_id INTO v_client_id
    FROM verification_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'verification_session % not found', p_session_id;
    END IF;

    UPDATE verification_sessions
    SET nic_encrypted   = NULL,
        name_encrypted  = NULL,
        dob_encrypted   = NULL,
        ip_address      = NULL,
        document_s3_key = NULL,
        selfie_s3_key   = NULL,
        deleted_at      = now()
    WHERE id = p_session_id;

    v_event := jsonb_build_object(
        'sessionId', p_session_id,
        'reason',    p_reason,
        'erasedAt',  now()
    );

    -- Hash is filled by audit_events_chain(); do not compute it here.
    INSERT INTO audit_events (session_id, client_id, event_type, actor, event_data)
    VALUES (p_session_id, v_client_id, 'PDPA_ERASURE', 'system', v_event);
END;
$$;

COMMIT;
