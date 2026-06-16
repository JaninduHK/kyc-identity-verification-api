-- Kestrel KYC — PDPA (Personal Data Protection Act, Sri Lanka) erasure support
-- Runs automatically after 001_initial.sql.

BEGIN;

-- erase_session_pii — Right-to-erasure: null out all PII columns for a session
-- and record the action in the immutable audit trail.
CREATE OR REPLACE FUNCTION erase_session_pii(p_session_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_client_id UUID;
    v_prev_hash VARCHAR(64);
    v_event     JSONB;
    v_hash      VARCHAR(64);
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

    -- Build the audit event payload and hash-chain it onto the latest entry.
    v_event := jsonb_build_object(
        'sessionId', p_session_id,
        'reason',    p_reason,
        'erasedAt',  now()
    );

    SELECT hash INTO v_prev_hash
    FROM audit_events
    ORDER BY id DESC
    LIMIT 1;

    v_prev_hash := COALESCE(v_prev_hash, '');
    v_hash := encode(digest(v_prev_hash || v_event::text, 'sha256'), 'hex');

    INSERT INTO audit_events (session_id, client_id, event_type, event_data, hash)
    VALUES (p_session_id, v_client_id, 'PDPA_ERASURE', v_event, v_hash);
END;
$$;

COMMIT;
