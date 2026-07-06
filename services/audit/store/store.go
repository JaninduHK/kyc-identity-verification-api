// Package store implements the hash-chained, append-only audit event store
// backed by PostgreSQL (via pgx/pgxpool).
package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kestrel-tech/kyc/audit/crypto"
	"github.com/kestrel-tech/kyc/audit/models"
)

// Store provides access to the audit_events table.
type Store struct {
	Pool *pgxpool.Pool
}

// New constructs a Store backed by the given connection pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{Pool: pool}
}

// Append records a new audit event, chaining it to the previous one.
//
// The hash is computed by the audit_events_chain BEFORE INSERT trigger, which
// serializes appends with a transaction-scoped advisory lock and hashes the
// whole record (prevHash + session_id + client_id + event_type + actor +
// event_data). Because the trigger both reads the previous hash and inserts
// within one statement/transaction, concurrent appends cannot fork the chain.
// The computed hash is returned via RETURNING.
func (s *Store) Append(ctx context.Context, event models.AuditEvent) (string, error) {
	// Normalise nil/empty data so the JSONB column always receives valid JSON.
	data := event.Data
	if len(data) == 0 {
		data = json.RawMessage("null")
	}

	// client_id and actor are nullable; pass nil when empty.
	var clientID interface{}
	if event.ClientID != "" {
		clientID = event.ClientID
	}
	var actor interface{}
	if event.Actor != "" {
		actor = event.Actor
	}

	var hash string
	err := s.Pool.QueryRow(
		ctx,
		`INSERT INTO audit_events (session_id, client_id, event_type, actor, event_data, created_at)
		 VALUES ($1, $2, $3, $4, $5, now())
		 RETURNING hash`,
		event.SessionID,
		clientID,
		event.EventType,
		actor,
		data,
	).Scan(&hash)
	if err != nil {
		return "", fmt.Errorf("insert audit event: %w", err)
	}

	return hash, nil
}

// List returns all events for a session ordered by insertion order (id ASC).
func (s *Store) List(ctx context.Context, sessionID string) ([]models.StoredEvent, error) {
	rows, err := s.Pool.Query(
		ctx,
		`SELECT id, event_type, COALESCE(actor, ''), event_data, hash, created_at
		 FROM audit_events
		 WHERE session_id = $1
		 ORDER BY id ASC`,
		sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	events := make([]models.StoredEvent, 0)
	for rows.Next() {
		var e models.StoredEvent
		if err := rows.Scan(&e.ID, &e.EventType, &e.Actor, &e.Data, &e.Hash, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	return events, nil
}

// chainRow is the minimal projection needed to recompute a hash-chain link.
type chainRow struct {
	ID        int64
	SessionID string
	ClientID  string
	EventType string
	Actor     string
	Data      string
	Hash      string
}

// ChainResult reports the outcome of a full-chain integrity verification.
type ChainResult struct {
	Valid    bool  `json:"valid"`
	Count    int   `json:"count"`
	BrokenAt int64 `json:"brokenAt"` // id of the first tampered row, 0 when valid
}

// VerifyChain recomputes the entire global hash chain from the first event and
// reports whether every stored hash still matches. It reads event_data as its
// normalized JSONB text (event_data::text) so the recomputed pre-image is
// byte-identical to the one the audit_events_chain trigger hashed on insert.
func (s *Store) VerifyChain(ctx context.Context) (ChainResult, error) {
	rows, err := s.Pool.Query(
		ctx,
		`SELECT id,
		        COALESCE(session_id::text, ''),
		        COALESCE(client_id::text, ''),
		        event_type,
		        COALESCE(actor, ''),
		        event_data::text,
		        hash
		 FROM audit_events
		 ORDER BY id ASC`,
	)
	if err != nil {
		return ChainResult{}, fmt.Errorf("query chain: %w", err)
	}
	defer rows.Close()

	chain := make([]chainRow, 0)
	for rows.Next() {
		var r chainRow
		if err := rows.Scan(&r.ID, &r.SessionID, &r.ClientID, &r.EventType, &r.Actor, &r.Data, &r.Hash); err != nil {
			return ChainResult{}, fmt.Errorf("scan chain row: %w", err)
		}
		chain = append(chain, r)
	}
	if err := rows.Err(); err != nil {
		return ChainResult{}, fmt.Errorf("iterate chain: %w", err)
	}

	return verifyChain(chain), nil
}

// verifyChain is the pure verification core: it walks the rows in order,
// recomputing each hash from the running previous hash and the row's fields,
// and returns the id of the first mismatch (0 if the chain is intact).
func verifyChain(rows []chainRow) ChainResult {
	prev := ""
	for _, r := range rows {
		expected := crypto.SHA256Hex(prev + r.SessionID + r.ClientID + r.EventType + r.Actor + r.Data)
		if expected != r.Hash {
			return ChainResult{Valid: false, Count: len(rows), BrokenAt: r.ID}
		}
		prev = r.Hash
	}
	return ChainResult{Valid: true, Count: len(rows), BrokenAt: 0}
}
