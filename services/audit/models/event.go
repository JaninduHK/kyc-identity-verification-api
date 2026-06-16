// Package models defines the audit event data structures.
package models

import (
	"encoding/json"
	"time"
)

// AuditEvent is the inbound representation of an audit event as posted by the
// orchestrator (and other internal callers).
type AuditEvent struct {
	SessionID string          `json:"sessionId"`
	ClientID  string          `json:"clientId,omitempty"`
	EventType string          `json:"eventType"`
	Actor     string          `json:"actor,omitempty"`
	Data      json.RawMessage `json:"data"`
}

// StoredEvent is the persisted representation returned by list queries. It
// includes server-assigned fields: the row ID, the chain hash and the
// creation timestamp.
type StoredEvent struct {
	ID        int64           `json:"id"`
	EventType string          `json:"eventType"`
	Data      json.RawMessage `json:"data"`
	Hash      string          `json:"hash"`
	CreatedAt time.Time       `json:"createdAt"`
}
