// Package handlers contains the HTTP handlers for the audit service.
package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kestrel-tech/kyc/audit/models"
	"github.com/kestrel-tech/kyc/audit/store"
)

// Handler wires HTTP requests to the audit store.
type Handler struct {
	Store *store.Store
}

// New constructs a Handler.
func New(s *store.Store) *Handler {
	return &Handler{Store: s}
}

// PostEvent records a new audit event.
func (h *Handler) PostEvent(w http.ResponseWriter, r *http.Request) {
	var event models.AuditEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "request body must be valid JSON")
		return
	}

	if event.SessionID == "" {
		writeError(w, http.StatusBadRequest, "missing_session_id", "sessionId is required")
		return
	}
	if event.EventType == "" {
		writeError(w, http.StatusBadRequest, "missing_event_type", "eventType is required")
		return
	}

	hash, err := h.Store.Append(r.Context(), event)
	if err != nil {
		slog.Error("failed to append audit event",
			"sessionId", event.SessionID,
			"eventType", event.EventType,
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "append_failed", "could not record audit event")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"hash":   hash,
		"status": "recorded",
	})
}

// GetEvents returns all audit events for a session.
func (h *Handler) GetEvents(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing_session_id", "sessionId path parameter is required")
		return
	}

	events, err := h.Store.List(r.Context(), sessionID)
	if err != nil {
		slog.Error("failed to list audit events", "sessionId", sessionID, "error", err)
		writeError(w, http.StatusInternalServerError, "list_failed", "could not list audit events")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sessionId": sessionID,
		"events":    events,
	})
}

// VerifyChain recomputes the entire audit hash chain and reports its integrity.
func (h *Handler) VerifyChain(w http.ResponseWriter, r *http.Request) {
	result, err := h.Store.VerifyChain(r.Context())
	if err != nil {
		slog.Error("failed to verify audit chain", "error", err)
		writeError(w, http.StatusInternalServerError, "verify_failed", "could not verify audit chain")
		return
	}

	// A broken chain is a successful verification with a negative result, not a
	// server error — surface it as 200 with valid=false so callers can alert.
	if !result.Valid {
		slog.Error("audit chain integrity check failed",
			"brokenAt", result.BrokenAt,
			"count", result.Count,
		)
	}

	writeJSON(w, http.StatusOK, result)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}
