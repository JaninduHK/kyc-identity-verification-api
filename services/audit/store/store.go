// Package store implements the hash-chained, append-only audit event store
// backed by PostgreSQL (via pgx/pgxpool).
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
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
// The new hash is SHA256Hex(prevHash + string(event.Data)) where prevHash is
// the hash of the most recently inserted row (empty string for the first
// event). It returns the computed hash.
func (s *Store) Append(ctx context.Context, event models.AuditEvent) (string, error) {
	var prevHash string
	err := s.Pool.QueryRow(
		ctx,
		`SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1`,
	).Scan(&prevHash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("query previous hash: %w", err)
	}

	// Normalise nil/empty data so the hash chain is deterministic and the
	// JSONB column always receives valid JSON.
	data := event.Data
	if len(data) == 0 {
		data = json.RawMessage("null")
	}

	hash := crypto.SHA256Hex(prevHash + string(data))

	// client_id is nullable; pass nil when empty.
	var clientID interface{}
	if event.ClientID != "" {
		clientID = event.ClientID
	}

	_, err = s.Pool.Exec(
		ctx,
		`INSERT INTO audit_events (session_id, client_id, event_type, event_data, hash, created_at)
		 VALUES ($1, $2, $3, $4, $5, now())`,
		event.SessionID,
		clientID,
		event.EventType,
		data,
		hash,
	)
	if err != nil {
		return "", fmt.Errorf("insert audit event: %w", err)
	}

	return hash, nil
}

// List returns all events for a session ordered by insertion order (id ASC).
func (s *Store) List(ctx context.Context, sessionID string) ([]models.StoredEvent, error) {
	rows, err := s.Pool.Query(
		ctx,
		`SELECT id, event_type, event_data, hash, created_at
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
		if err := rows.Scan(&e.ID, &e.EventType, &e.Data, &e.Hash, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	return events, nil
}
